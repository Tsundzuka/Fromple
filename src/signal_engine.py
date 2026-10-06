# ============================================================
# src/signal_engine.py
# ============================================================
# Turns a class firing into signals, and opens paper experiments
# in both directions (long + short) simultaneously.
#
# BATCH MODE: iterates through the per-bar conditions history
# produced by conditions.py. All signal lookups, code allocation,
# touch counting, and experiment discovery happen in memory.
# Supabase is hit only at the end of each (symbol, timeframe):
#   - 1 bulk insert for all new signals
#   - 1 bulk upsert for all existing signals whose recurrences changed
#   - 1 bulk insert for all new experiments
#
# Signal code format: Cl-{SYMBOL}-{TIMEFRAME}-{CLASS}-Si-{NN}-{L|S}
# e.g. Cl-AUDUSD-H1-A-Si-01-L
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
for _noisy in ("httpx", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

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
    """
    Load every signal for a class. Returns full rows so the caller
    can safely upsert updates back with the same shape.
    """
    try:
        res = (
            sb._get()
            .table("signals")
            .select("id, signal_code, class_id, direction, variations, "
                    "recurrences, status, first_fired, last_fired")
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


def max_signal_number(
    symbol: str,
    timeframe: str,
    class_code: str,
    direction: str,
    existing_signals: list[dict],
) -> int:
    """
    Highest NN found for this (symbol, timeframe, class, direction).
    """
    prefix = f"Cl-{sanitise_symbol(symbol)}-{timeframe}-{class_code}-Si-"
    suffix = f"-{direction_suffix(direction)}"
    max_nn = 0
    for s in existing_signals:
        if s.get("direction") != direction:
            continue
        code = s.get("signal_code", "")
        if not code.startswith(prefix) or not code.endswith(suffix):
            continue
        middle = code[len(prefix):-len(suffix)]
        try:
            n = int(middle)
            if n > max_nn:
                max_nn = n
        except ValueError:
            continue
    return max_nn


# ============================================================
# BATCH PROCESSING PER TIMEFRAME
# ============================================================
def process_timeframe(symbol: str, timeframe: str, duration_minutes: int) -> dict:
    """
    Processes every unprocessed bar in the conditions history for
    one (symbol, timeframe).
    """
    key = f"run:{symbol}:{timeframe}:conditions"
    raw = rds.get_json(key)
    if not raw:
        return {"processed": 0, "signals_new": 0, "signals_touched": 0, "experiments": 0}

    history = raw if isinstance(raw, list) else [raw]

    class_index = build_class_index(symbol, timeframe, version=1)
    if not class_index["by_fp"]:
        return {"processed": 0, "signals_new": 0, "signals_touched": 0, "experiments": 0}

    last_processed = get_last_processed(symbol, timeframe)
    forward_window = config.FORWARD_WINDOW

    # Caches and buffers
    signals_by_class: dict[str, list[dict]] = {}
    next_nn_by_class_dir: dict[tuple[str, str], int] = {}

    new_signals: dict[str, dict] = {}           # signal_code -> row payload
    existing_touch_counts: dict[str, int] = {}  # signal_id -> delta
    pending_experiments: list[dict] = []        # unresolved (signal_code, ...)

    bars_processed = 0
    max_bar_dt = last_processed

    for entry in history:
        bar_dt_str = entry.get("_bar_dt")
        if not bar_dt_str:
            continue
        if last_processed and bar_dt_str <= last_processed:
            continue

        fp = build_fingerprint(entry)
        if not fp:
            max_bar_dt = bar_dt_str
            continue

        class_row = class_index["by_fp"].get(fp)
        if not class_row:
            max_bar_dt = bar_dt_str
            continue

        class_id = class_row["id"]
        if class_id not in signals_by_class:
            signals_by_class[class_id] = fetch_signals_for_class(class_id)

        variations = build_variation_snapshot(entry)

        entry_dt = _parse_bar_dt(bar_dt_str)
        if entry_dt is None:
            continue

        for direction in ("long", "short"):
            signal = find_matching_signal(
                signals_by_class[class_id], direction, variations,
            )

            if signal:
                # Existing signal (loaded from DB, or created earlier
                # in this same run).
                sid = signal.get("id")
                if sid:
                    existing_touch_counts[sid] = existing_touch_counts.get(sid, 0) + 1
                else:
                    # Newly created in this run — bump the in-memory count
                    signal["recurrences"] = (signal.get("recurrences") or 0) + 1
                signal_code = signal["signal_code"]
            else:
                # Allocate a new signal code in memory
                class_code = class_row["class_code"]
                nk = (class_code, direction)
                if nk not in next_nn_by_class_dir:
                    next_nn_by_class_dir[nk] = max_signal_number(
                        symbol, timeframe, class_code, direction,
                        signals_by_class[class_id],
                    )
                next_nn_by_class_dir[nk] += 1
                nn = next_nn_by_class_dir[nk]
                signal_code = (
                    f"Cl-{sanitise_symbol(symbol)}-{timeframe}-{class_code}-"
                    f"Si-{nn:02d}-{direction_suffix(direction)}"
                )

                # Add to the in-memory cache so later bars match it
                signal = {
                    "id": None,
                    "signal_code": signal_code,
                    "class_id": class_id,
                    "direction": direction,
                    "variations": normalise_variations(variations),
                    "recurrences": 1,
                    "status": "watching",
                    "first_fired": entry_dt.isoformat(),
                    "last_fired": entry_dt.isoformat(),
                }
                signals_by_class[class_id].append(signal)
                new_signals[signal_code] = signal

            pending_experiments.append({
                "signal_code": signal_code,
                "class_id":    class_id,
                "direction":   direction,
                "entry_dt":    entry_dt,
                "conditions":  entry,
            })

        bars_processed += 1
        max_bar_dt = bar_dt_str

    # --- Flush: bulk insert new signals ---
    code_to_id: dict[str, str] = {}
    if new_signals:
        rows = [
            {
                "signal_code": sig["signal_code"],
                "class_id":    sig["class_id"],
                "direction":   sig["direction"],
                "variations":  sig["variations"],
                "recurrences": sig.get("recurrences") or 1,
                "status":      "watching",
            }
            for sig in new_signals.values()
        ]
        try:
            res = sb._get().table("signals").insert(rows).execute()
            for r in (res.data or []):
                if r.get("signal_code"):
                    code_to_id[r["signal_code"]] = r["id"]
        except Exception as e:
            log.error("bulk insert signals failed: %s", e)

    # --- Flush: bulk insert experiments ---
    experiments: list[dict] = []
    for p in pending_experiments:
        sid = code_to_id.get(p["signal_code"])
        if not sid:
            # Signal was not created in this run — must look it up
            # in the class cache instead.
            for sigs in signals_by_class.values():
                for s in sigs:
                    if s.get("signal_code") == p["signal_code"] and s.get("id"):
                        sid = s["id"]
                        break
                if sid:
                    break
            if not sid:
                continue

        ctx = p["conditions"].get("_context") or {}
        entry_price = ctx.get("close")
        if entry_price is None:
            continue

        duration = timedelta(minutes=duration_minutes * forward_window)

        experiments.append({
            "signal_id":      sid,
            "class_id":       p["class_id"],
            "symbol":         symbol,
            "timeframe":      timeframe,
            "direction":      p["direction"],
            "entry_price":    float(entry_price),
            "entry_at":       p["entry_dt"].isoformat(),
            "forward_window": forward_window,
            "expires_at":     (p["entry_dt"] + duration).isoformat(),
            "favorable_pips": 0,
            "adverse_pips":   0,
            "status":         "open",
        })

    experiments_inserted = 0
    if experiments:
        CHUNK = 500
        for i in range(0, len(experiments), CHUNK):
            chunk = experiments[i : i + CHUNK]
            try:
                sb._get().table("open_experiments").insert(chunk).execute()
                experiments_inserted += len(chunk)
            except Exception as e:
                log.error("bulk insert experiments failed: %s", e)

    # --- Flush: upsert touched signals ---
    touched_count = 0
    if existing_touch_counts:
        now_iso = datetime.now(timezone.utc).isoformat()
        upsert_rows: list[dict] = []

        # Build id → full row lookup from cache
        lookup: dict[str, dict] = {}
        for sigs in signals_by_class.values():
            for s in sigs:
                if s.get("id"):
                    lookup[s["id"]] = s

        for sid, delta in existing_touch_counts.items():
            s = lookup.get(sid)
            if not s:
                continue
            upsert_rows.append({
                "id":           sid,
                "signal_code":  s["signal_code"],
                "class_id":     s["class_id"],
                "direction":    s["direction"],
                "variations":   normalise_variations(s.get("variations") or {}),
                "recurrences":  (s.get("recurrences") or 0) + delta,
                "status":       s.get("status") or "watching",
                "first_fired":  s.get("first_fired") or now_iso,
                "last_fired":   now_iso,
            })

        if upsert_rows:
            CHUNK = 500
            for i in range(0, len(upsert_rows), CHUNK):
                chunk = upsert_rows[i : i + CHUNK]
                try:
                    sb._get().table("signals").upsert(
                        chunk, on_conflict="id"
                    ).execute()
                    touched_count += len(chunk)
                except Exception as e:
                    log.warning("bulk upsert of touched signals failed: %s", e)

    # --- Advance per-bar guard ---
    if max_bar_dt and max_bar_dt != last_processed:
        mark_processed(symbol, timeframe, max_bar_dt)

    log.info(
        "  %s %s: %d bars, +%d signals, %d touched, %d experiments",
        symbol, timeframe, bars_processed,
        len(new_signals), touched_count, experiments_inserted,
    )

    return {
        "processed":         bars_processed,
        "signals_new":       len(new_signals),
        "signals_touched":   touched_count,
        "experiments":       experiments_inserted,
    }


# ============================================================
# MAIN PIPELINE
# ============================================================
def run() -> int:
    log.info("=== signal_engine starting (batched) ===")

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

    # Unique (symbol, tf) pairs
    pairs: set[tuple[str, str]] = set()
    for s in sessions:
        symbol = s.get("symbol")
        for tf in (s.get("timeframes") or []):
            if symbol and tf and tf in timeframes:
                pairs.add((symbol, tf))

    total_bars = 0
    total_signals = 0
    total_experiments = 0

    for symbol, tf in sorted(pairs):
        duration = int(timeframes[tf]["duration_minutes"])
        result = process_timeframe(symbol, tf, duration)
        total_bars += result["processed"]
        total_signals += result["signals_new"]
        total_experiments += result["experiments"]

    log.info(
        "=== signal_engine finished: %d bars, %d new signals, %d experiments ===",
        total_bars, total_signals, total_experiments,
    )
    return total_bars


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
