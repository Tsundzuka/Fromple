# ============================================================
# src/signal_engine.py
# ============================================================
# Turns a class firing into signals, and opens paper experiments
# in both directions (long + short) simultaneously.
#
# Entry point: python -m src.signal_engine
#
# Signal codes are globally unique across the whole table:
#   Cl-{SYMBOL}-{CLASS}-Si-{NN}
# e.g. Cl-EURUSD-A-Si-01, Cl-USDCAD-C-Si-17
#
# The symbol prefix prevents collisions when two different
# instruments happen to fire the same class letter.
#
# Flow, per (symbol, timeframe):
#   1. Skip if the last bar was already processed
#   2. Load conditions + fingerprint from Redis
#   3. Find the class the class_engine matched
#   4. Snapshot the variations (indicators + calendar)
#   5. For each direction (long, short):
#         - find or create a signal
#         - open an experiment
#   6. Mark the bar processed
#
# Timeframe duration comes from the timeframes registry.

import logging
import sys
from datetime import datetime, timezone, timedelta

from . import config
from . import supabase_client as sb
from . import redis_client as rds
from .class_engine import find_matching_class, build_variation_snapshot

# ------------------------------------------------------------
# Logging
# ------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("signal_engine")


# ------------------------------------------------------------
# Symbol sanitisation
# ------------------------------------------------------------
def sanitise_symbol(symbol: str) -> str:
    """
    Turn 'EUR/USD' into 'EURUSD'. Strips anything that isn't
    a letter or digit so it's safe inside the signal code.
    """
    return "".join(c for c in (symbol or "") if c.isalnum()).upper()


# ------------------------------------------------------------
# Per-bar processing guard
# ------------------------------------------------------------
def _processed_bar_key(symbol: str, timeframe: str) -> str:
    return f"run:{symbol}:{timeframe}:last_processed_bar"


def already_processed(symbol: str, timeframe: str, bar_dt: str) -> bool:
    last = rds.get_json(_processed_bar_key(symbol, timeframe))
    return last == bar_dt


def mark_processed(symbol: str, timeframe: str, bar_dt: str) -> None:
    rds.set_json(_processed_bar_key(symbol, timeframe), bar_dt)


# ============================================================
# SIGNAL LOOKUP
# ============================================================

def fetch_signals_for_class(class_id: str) -> list[dict]:
    try:
        res = (
            sb._get()
            .table("signals")
            .select("id, signal_code, direction, variations, recurrences")
            .eq("class_id", class_id)
            .execute()
        )
        return res.data or []
    except Exception as e:
        log.warning("fetch_signals_for_class failed: %s", e)
        return []


def normalise_variations(v: dict | None) -> dict:
    if not v:
        return {}
    return {k: True for k, val in sorted(v.items()) if val is True}


def find_matching_signal(
    existing_signals: list[dict],
    direction: str,
    variations: dict,
) -> dict | None:
    target = normalise_variations(variations)
    for s in existing_signals:
        if s.get("direction") != direction:
            continue
        if normalise_variations(s.get("variations") or {}) == target:
            return s
    return None


def next_signal_number(symbol: str, class_code: str, existing_signals: list[dict]) -> int:
    """
    Return the next NN for this (symbol, class) combination.
    Looks for signals with the code prefix Cl-{SYMBOL}-{CLASS}-Si-.
    """
    prefix = f"Cl-{sanitise_symbol(symbol)}-{class_code}-Si-"
    max_nn = 0
    for s in existing_signals:
        code = s.get("signal_code", "")
        if code.startswith(prefix):
            try:
                n = int(code[len(prefix):])
                if n > max_nn:
                    max_nn = n
            except ValueError:
                continue
    return max_nn + 1


# ============================================================
# SIGNAL CREATE / TOUCH
# ============================================================

def create_signal(
    class_row: dict,
    symbol: str,
    direction: str,
    variations: dict,
    existing_signals: list[dict],
) -> dict | None:
    class_code = class_row["class_code"]
    nn = next_signal_number(symbol, class_code, existing_signals)
    code = f"Cl-{sanitise_symbol(symbol)}-{class_code}-Si-{nn:02d}"

    payload = {
        "signal_code": code,
        "class_id":    class_row["id"],
        "direction":   direction,
        "variations":  normalise_variations(variations),
        "recurrences": 1,
        "status":      "watching",
    }

    log.info("Creating signal %s (%s) for Class %s",
             code, direction, class_code)

    return sb.upsert_signal(payload)


def touch_signal(signal: dict) -> None:
    try:
        new_count = (signal.get("recurrences") or 0) + 1
        (
            sb._get()
            .table("signals")
            .update({
                "recurrences": new_count,
                "last_fired":  datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", signal["id"])
            .execute()
        )
    except Exception as e:
        log.warning("touch_signal failed: %s", e)


# ============================================================
# OPEN EXPERIMENT
# ============================================================

def open_experiment(
    signal: dict,
    class_row: dict,
    conditions: dict,
    direction: str,
    forward_window: int,
    duration_minutes: int,
) -> dict | None:
    ctx = conditions.get("_context") or {}
    entry_price = ctx.get("close")
    symbol = ctx.get("symbol")
    timeframe = ctx.get("timeframe")

    if entry_price is None or not symbol or not timeframe:
        log.warning("Cannot open experiment — missing context")
        return None

    if duration_minutes <= 0:
        log.warning("Cannot open experiment — invalid duration for %s", timeframe)
        return None

    duration = timedelta(minutes=duration_minutes * forward_window)
    now = datetime.now(timezone.utc)

    payload = {
        "signal_id":      signal["id"],
        "class_id":       class_row["id"],
        "symbol":         symbol,
        "timeframe":      timeframe,
        "direction":      direction,
        "entry_price":    float(entry_price),
        "entry_at":       now.isoformat(),
        "forward_window": forward_window,
        "expires_at":     (now + duration).isoformat(),
        "favorable_pips": 0,
        "adverse_pips":   0,
        "status":         "open",
    }

    return sb.insert_open_experiment(payload)


# ============================================================
# MAIN PIPELINE
# ============================================================

def run() -> int:
    log.info("=== signal_engine starting ===")

    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped. Exiting.")
        return 0

    timeframes = sb.get_timeframe_map()
    if not timeframes:
        log.warning("No timeframes registry available. Exiting.")
        return 0

    sessions = sb.get_active_sessions()
    if not sessions:
        log.info("No active sessions. Exiting.")
        return 0

    processed = 0

    for s in sessions:
        symbol = s.get("symbol")
        tf_codes = s.get("timeframes") or []
        if not symbol or not tf_codes:
            continue

        for tf in tf_codes:
            tf_meta = timeframes.get(tf)
            if not tf_meta:
                log.debug("Unknown timeframe '%s' — skipping", tf)
                continue
            duration_minutes = tf_meta["duration_minutes"]

            conditions = rds.load_conditions(symbol, tf)
            if not conditions or not conditions.get("_context"):
                continue

            bars = rds.load_bars(symbol, tf)
            if not bars:
                continue
            last_bar_dt = bars[-1].get("datetime")
            if not last_bar_dt:
                continue

            if already_processed(symbol, tf, last_bar_dt):
                log.debug("Bar already processed for %s %s — skipping", symbol, tf)
                continue

            fp = rds.get_json(f"run:{symbol}:{tf}:fingerprint")
            fingerprint = (fp or {}).get("fingerprint")
            if not fingerprint:
                log.debug("No fingerprint for %s %s — skipping", symbol, tf)
                continue

            class_row = find_matching_class(symbol, tf, fingerprint)
            if not class_row:
                log.warning("No class matched for %s %s — skipping", symbol, tf)
                continue

            variations = build_variation_snapshot(conditions)

            existing_signals = fetch_signals_for_class(class_row["id"])
            forward_window = config.FORWARD_WINDOW

            for direction in ("long", "short"):
                signal = find_matching_signal(existing_signals, direction, variations)

                if signal:
                    touch_signal(signal)
                    log.info("  ✔ %s %s → existing signal %s (%s)",
                             symbol, tf, signal["signal_code"], direction)
                else:
                    signal = create_signal(
                        class_row, symbol, direction, variations, existing_signals,
                    )
                    if signal:
                        log.info("  ✔ %s %s → new signal %s (%s)",
                                 symbol, tf, signal["signal_code"], direction)
                    else:
                        log.warning("  ✘ %s %s → could not create %s signal",
                                    symbol, tf, direction)
                        continue

                exp = open_experiment(
                    signal, class_row, conditions, direction,
                    forward_window, duration_minutes,
                )
                if exp:
                    log.info("      opened experiment %s (expires in %d bars of %s)",
                             exp["id"], forward_window, tf)
                else:
                    log.warning("      could not open experiment for %s",
                                signal["signal_code"])

            mark_processed(symbol, tf, last_bar_dt)
            processed += 1

    log.info("=== signal_engine finished: %d pairs processed ===", processed)
    return processed


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        run()
        sys.exit(0)
    except Exception as e:
        log.exception("signal_engine failed: %s", e)
        sys.exit(1)
