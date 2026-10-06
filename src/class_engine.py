# ============================================================
# src/class_engine.py
# ============================================================
# Maps per-bar condition dictionaries to registered classes.
#
# BATCH MODE: iterates through every unprocessed bar in the
# conditions history produced by conditions.py.
#
# PERFORMANCE: all class lookups, count increments, and new-class
# discoveries are held in memory during the bar loop. Supabase is
# hit only at the end of each (symbol, timeframe):
#   - 1 bulk insert for all new classes discovered
#   - 1 update per existing class whose occurrences changed
#
# Entry point: python -m src.class_engine

import logging
import sys
import string
from datetime import datetime, timezone

from . import supabase_client as sb
from . import redis_client as rds

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

log = logging.getLogger("class_engine")


# ------------------------------------------------------------
# Defining vs variation prefixes
# ------------------------------------------------------------
DEFINING_PREFIXES  = ("regime.", "state.", "cot.", "sentiment.")
VARIATION_PREFIXES = ("ind.", "cal.", "news.")


# ============================================================
# PER-BAR GUARD
# ============================================================
def _class_bar_key(symbol: str, timeframe: str) -> str:
    return f"run:{symbol}:{timeframe}:last_class_bar"


def get_last_class_bar(symbol: str, timeframe: str) -> str | None:
    return rds.get_json(_class_bar_key(symbol, timeframe))


def mark_class_bar_processed(symbol: str, timeframe: str, bar_dt: str) -> None:
    rds.set_json(_class_bar_key(symbol, timeframe), bar_dt)


# ============================================================
# FINGERPRINT
# ============================================================
def build_fingerprint(conditions: dict) -> str:
    active_defining = sorted(
        k for k, v in conditions.items()
        if v is True
        and not k.startswith("_")
        and k.startswith(DEFINING_PREFIXES)
    )
    return "|".join(active_defining)


def split_conditions(conditions: dict) -> dict:
    regime = None
    for r in ("uptrend", "downtrend", "consolidating"):
        if conditions.get(f"regime.{r}"):
            regime = r
            break

    state = {
        k[len("state."):]: bool(v)
        for k, v in conditions.items()
        if k.startswith("state.") and v is True
    }
    cot = {
        k[len("cot."):]: bool(v)
        for k, v in conditions.items()
        if k.startswith("cot.") and v is True
    }
    sentiment = {
        k[len("sentiment."):]: bool(v)
        for k, v in conditions.items()
        if k.startswith("sentiment.") and v is True
    }

    return {
        "regime":    regime or "consolidating",
        "state":     state,
        "cot":       cot,
        "sentiment": sentiment,
    }


# ============================================================
# CLASS CODE ALLOCATION
# ============================================================
def to_class_code(n: int) -> str:
    n += 1
    result = ""
    while n > 0:
        n -= 1
        result = string.ascii_uppercase[n % 26] + result
        n //= 26
    return result


def next_available_code(existing_codes: set[str]) -> str:
    i = 0
    while True:
        code = to_class_code(i)
        if code not in existing_codes:
            return code
        i += 1


# ============================================================
# LOOKUP AND MATCHING
# ============================================================
def fetch_existing_classes(symbol: str, timeframe: str, version: int = 1) -> list[dict]:
    try:
        res = (
            sb._get()
            .table("classes")
            .select("id, class_code, regime, market_state, cot, sentiment, occurrences, status")
            .eq("symbol", symbol)
            .eq("timeframe", timeframe)
            .eq("definition_version", version)
            .execute()
        )
        return res.data or []
    except Exception as e:
        log.warning("fetch_existing_classes failed: %s", e)
        return []


def reconstruct_fingerprint(row: dict) -> str:
    parts: list[str] = []
    regime = row.get("regime")
    if regime:
        parts.append(f"regime.{regime}")
    for key in sorted((row.get("market_state") or {}).keys()):
        if row["market_state"][key]:
            parts.append(f"state.{key}")
    for key in sorted((row.get("cot") or {}).keys()):
        if row["cot"][key]:
            parts.append(f"cot.{key}")
    for key in sorted((row.get("sentiment") or {}).keys()):
        if row["sentiment"][key]:
            parts.append(f"sentiment.{key}")
    return "|".join(sorted(parts))


def build_class_index(symbol: str, timeframe: str, version: int = 1) -> dict:
    rows = fetch_existing_classes(symbol, timeframe, version)
    by_fp: dict[str, dict] = {}
    by_id: dict[str, dict] = {}
    codes: set[str] = set()
    for row in rows:
        fp = reconstruct_fingerprint(row)
        if fp:
            by_fp[fp] = row
        by_id[row["id"]] = row
        if row.get("class_code"):
            codes.add(row["class_code"])
    return {
        "by_fp": by_fp,
        "by_id": by_id,
        "codes": codes,
        "count": len(rows),
    }


# ============================================================
# CONDITIONS HISTORY
# ============================================================
def load_conditions_history(symbol: str, timeframe: str) -> list[dict]:
    key = f"run:{symbol}:{timeframe}:conditions"
    raw = rds.get_json(key)
    if raw is None:
        return []
    if isinstance(raw, list):
        return [c for c in raw if isinstance(c, dict)]
    if isinstance(raw, dict):
        return [raw]
    return []


# ============================================================
# BATCH PROCESSING PER TIMEFRAME
# ============================================================
def process_timeframe(symbol: str, timeframe: str) -> tuple[int, int, int, int]:
    """
    Returns (bars_processed, bars_skipped, new_classes, updated_classes).
    """
    history = load_conditions_history(symbol, timeframe)
    if not history:
        return (0, 0, 0, 0)

    index = build_class_index(symbol, timeframe, version=1)

    existing_deltas: dict[str, int] = {}
    new_fps: dict[str, dict] = {}

    last_processed = get_last_class_bar(symbol, timeframe)
    max_bar_dt = last_processed

    bars_processed = 0
    bars_skipped = 0

    for entry in history:
        bar_dt = entry.get("_bar_dt")
        if not bar_dt:
            bars_skipped += 1
            continue
        if last_processed and bar_dt <= last_processed:
            bars_skipped += 1
            continue

        fp = build_fingerprint(entry)
        if not fp:
            max_bar_dt = bar_dt
            continue

        if fp in index["by_fp"]:
            cid = index["by_fp"][fp]["id"]
            existing_deltas[cid] = existing_deltas.get(cid, 0) + 1
        else:
            if fp not in new_fps:
                new_fps[fp] = {"entry": entry, "count": 0}
            new_fps[fp]["count"] += 1

        max_bar_dt = bar_dt
        bars_processed += 1

    # --- Flush new classes as one bulk insert ---
    new_count = 0
    if new_fps:
        now_iso = datetime.now(timezone.utc).isoformat()
        rows = []
        for fp, data in new_fps.items():
            code = next_available_code(index["codes"])
            index["codes"].add(code)
            split = split_conditions(data["entry"])
            rows.append({
                "class_code":         code,
                "symbol":             symbol,
                "timeframe":          timeframe,
                "regime":             split["regime"],
                "market_state":       split["state"],
                "cot":                split["cot"],
                "sentiment":          split["sentiment"],
                "definition_version": 1,
                "occurrences":        data["count"],
                "status":             "watching",
                "first_seen":         now_iso,
                "last_seen":          now_iso,
            })
        try:
            sb._get().table("classes").insert(rows).execute()
            new_count = len(rows)
        except Exception as e:
            log.error("bulk insert of new classes failed: %s", e)

    # --- Update existing classes whose counts changed ---
    updated_count = 0
    if existing_deltas:
        now_iso = datetime.now(timezone.utc).isoformat()
        for cid, delta in existing_deltas.items():
            row = index["by_id"].get(cid)
            if not row:
                continue
            new_occ = (row.get("occurrences") or 0) + delta
            try:
                sb._get().table("classes").update({
                    "occurrences": new_occ,
                    "last_seen":   now_iso,
                }).eq("id", cid).execute()
                updated_count += 1
            except Exception as e:
                log.warning("update failed for class %s: %s", cid, e)

    # --- Advance per-bar guard ---
    if max_bar_dt and max_bar_dt != last_processed:
        mark_class_bar_processed(symbol, timeframe, max_bar_dt)

    log.info(
        "  %s %s: %d bars processed, %d skipped, +%d new classes, %d updated",
        symbol, timeframe, bars_processed, bars_skipped, new_count, updated_count,
    )

    return (bars_processed, bars_skipped, new_count, updated_count)


# ============================================================
# MAIN PIPELINE
# ============================================================
def run() -> int:
    log.info("=== class_engine starting (batched) ===")

    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped. Exiting.")
        return 0

    sessions = sb.get_active_sessions()
    if not sessions:
        log.info("No active sessions. Exiting.")
        return 0

    # Deduplicate (symbol, tf) pairs across sessions
    pairs: set[tuple[str, str]] = set()
    for s in sessions:
        symbol = s.get("symbol")
        for tf in (s.get("timeframes") or []):
            if symbol and tf:
                pairs.add((symbol, tf))

    total_processed = 0
    for symbol, tf in sorted(pairs):
        processed, _, _, _ = process_timeframe(symbol, tf)
        total_processed += processed

    log.info("=== class_engine finished: %d bars processed ===", total_processed)
    return total_processed


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        run()
        sys.exit(0)
    except Exception as e:
        log.exception("class_engine failed: %s", e)
        sys.exit(1)
