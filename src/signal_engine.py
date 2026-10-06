# ============================================================
# src/signal_engine.py
# ============================================================
# Turns a class firing into signals, and opens paper experiments
# in both directions (long + short) simultaneously.
#
# BATCH MODE: iterates through the per-bar conditions history
# produced by conditions.py. For each unprocessed bar:
#   1. Compute the bar's fingerprint
#   2. Look up the matching class
#   3. Snapshot variations
#   4. For each direction (long, short):
#        - find or create signal
#        - open experiment with entry_at = the bar's datetime
#
# Signal codes are globally unique across the whole table:
#   Cl-{SYMBOL}-{CLASS}-Si-{NN}-{L|S}
#
# Entry point: python -m src.signal_engine

import logging
import sys
from datetime import datetime, timezone, timedelta

from . import config
from . import supabase_client as sb
from . import redis_client as rds
from .class_engine import build_fingerprint, build_class_index

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
# Constants
# ------------------------------------------------------------
VARIATION_PREFIXES = ("ind.", "cal.", "news.")


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
def sanitise_symbol(symbol: str) -> str:
    """EUR/USD → EURUSD"""
    return "".join(c for c in (symbol or "") if c.isalnum()).upper()


def direction_suffix(direction: str) -> str:
    """long → L, short → S"""
    return "L" if direction == "long" else "S"


def _parse_bar_dt(value: str) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(value).strip(), fmt).replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            continue
    return None


# ============================================================
# VARIATION SNAPSHOT
# ============================================================
def build_variation_snapshot(conditions: dict) -> dict:
    """Snapshot which variation elements fired on this bar."""
    return {
        k: True
        for k, v in conditions.items()
        if v is True and not k.startswith("_") and k.startswith(VARIATION_PREFIXES)
    }


def normalise_variations(v: dict | None) -> dict:
    if not v:
        return {}
    return {k: True for k, val in sorted(v.items()) if val is True}


def variations_key(variations: dict) -> str:
    """Stable signature for cache lookups."""
    return "|".join(sorted(k for k, v in variations.items() if v))


# ============================================================
# PER-BAR PROCESSING GUARD
# ============================================================
def _processed_bar_key(symbol: str, timeframe: str) -> str:
    return f"run:{symbol}:{timeframe}:last_processed_bar"


def get_last_processed(symbol: str, timeframe: str) -> str | None:
    return rds.get_json(_processed_bar_key(symbol, timeframe))


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


def find_matching_signal(
    existing_signals: list[dict],
    direction: str,
    variations: dict,
) -> dict | None:
    target = variations_key(variations)
    for s in existing_signals:
        if s.get("direction") != direction:
            continue
        if variations_key(normalise_variations(s.get("variations") or {})) == target:
            return s
    return None


def next_signal_number(
    symbol: str,
    class_code: str,
    direction: str,
    existing_signals: list[dict],
) -> int:
    prefix = f"Cl-{sanitise_symbol(symbol)}-{class_code}-Si-"
    suffix = f"-{direction_suffix(direction)}"
    max_nn = 0
    for s in existing_signals:
        code = s.get("signal_code", "")
        if s.get("direction") != direction:
            continue
        if not code.startswith(prefix) or not code.endswith(suffix):
            continue
        middle = code[len(prefix):-len(suffix)]
        try:
            n = int(middle)
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
    nn = next_signal_number(symbol, class_code, direction, existing_signals)
    code = (
        f"Cl-{sanitise_symbol(symbol)}-{class_code}-"
        f"Si-{nn:02d}-{direction_suffix(direction)}"
    )

    payload = {
        "signal_code": code,
        "class_id":    class_row["id"],
        "direction":   direction,
        "variations":  normalise_variations(variations),
        "recurrences": 1,
        "status":      "watching",
    }

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
        signal["recurrences"] = new_count
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
    entry_at: datetime,
) -> dict | None:
    """
    Open a paper experiment with entry_at = the bar's datetime.
    For live cycles this is "now"; for backfill it is the bar's
    historical timestamp.
    """
    ctx = conditions.get("_context") or {}
    entry_price = ctx.get("close")
    symbol = ctx.get("symbol")
    timeframe = ctx.get("timeframe")

    if entry_price is None or not symbol or not timeframe:
        return None

    if duration_minutes <= 0:
        return None

    duration = timedelta(minutes=duration_minutes * forward_window)

    payload = {
        "signal_id":      signal["id"],
        "class_id":       class_row["id"],
        "symbol":         symbol,
        "timeframe":      timeframe,
        "direction":      direction,
        "entry_price":    float(entry_price),
        "entry_at":       entry_at.isoformat(),
        "forward_window": forward_window,
        "expires_at":     (entry_at + duration).isoformat(),
        "favorable_pips": 0,
        "adverse_pips":   0,
        "status":         "open",
    }

    return sb.insert_open_experiment(payload)


# ============================================================
# MAIN PIPELINE
# ============================================================
def run() -> int:
    log.info("=== signal_engine starting (batch mode) ===")

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

    total_processed = 0
    total_skipped = 0

    for s in sessions:
        symbol = s.get("symbol")
        tf_codes = s.get("timeframes") or []
        if not symbol or not tf_codes:
            continue

        for tf in tf_codes:
            tf_meta = timeframes.get(tf)
            if not tf_meta:
                continue
            duration_minutes = tf_meta["duration_minutes"]

            history = rds.load_conditions(symbol, tf)
            if not history:
                continue

            # Normalise into a list (backward compatible)
            if isinstance(history, dict):
                history = [history]
            if not isinstance(history, list):
                continue

            # Build the class index once per (symbol, tf)
            class_index = build_class_index(symbol, tf, version=1)
            if not class_index["by_fp"]:
                log.debug("No classes indexed for %s %s — skipping", symbol, tf)
                continue

            last_processed = get_last_processed(symbol, tf)
            forward_window = config.FORWARD_WINDOW

            # Signal cache: class_id → list of signals
            signal_cache: dict[str, list[dict]] = {}

            processed_this = 0
            skipped_this = 0

            for entry in history:
                bar_dt_str = entry.get("_bar_dt")
                if not bar_dt_str:
                    skipped_this += 1
                    continue

                if last_processed and bar_dt_str <= last_processed:
                    skipped_this += 1
                    continue

                entry_dt = _parse_bar_dt(bar_dt_str)
                if entry_dt is None:
                    skipped_this += 1
                    continue

                fingerprint = build_fingerprint(entry)
                if not fingerprint:
                    mark_processed(symbol, tf, bar_dt_str)
                    skipped_this += 1
                    continue

                class_row = class_index["by_fp"].get(fingerprint)
                if not class_row:
                    log.debug("No class for %s %s @ %s", symbol, tf, bar_dt_str)
                    mark_processed(symbol, tf, bar_dt_str)
                    skipped_this += 1
                    continue

                class_id = class_row["id"]
                if class_id not in signal_cache:
                    signal_cache[class_id] = fetch_signals_for_class(class_id)

                variations = build_variation_snapshot(entry)

                for direction in ("long", "short"):
                    signal = find_matching_signal(
                        signal_cache[class_id], direction, variations,
                    )

                    if signal:
                        touch_signal(signal)
                    else:
                        signal = create_signal(
                            class_row, symbol, direction,
                            variations, signal_cache[class_id],
                        )
                        if signal:
                            signal_cache[class_id].append(signal)

                    if not signal:
                        log.warning(
                            "  ✘ %s %s @ %s → could not create %s signal",
                            symbol, tf, bar_dt_str, direction,
                        )
                        continue

                    exp = open_experiment(
                        signal, class_row, entry, direction,
                        forward_window, duration_minutes, entry_dt,
                    )
                    if not exp:
                        log.warning(
                            "      could not open experiment for %s",
                            signal.get("signal_code"),
                        )

                mark_processed(symbol, tf, bar_dt_str)
                processed_this += 1

            if processed_this or skipped_this:
                log.info(
                    "  %s %s: %d bars processed, %d skipped",
                    symbol, tf, processed_this, skipped_this,
                )

            total_processed += processed_this
            total_skipped += skipped_this

    log.info("=== signal_engine finished: %d processed, %d skipped ===",
             total_processed, total_skipped)
    return total_processed


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
