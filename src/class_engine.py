# ============================================================
# src/class_engine.py
# ============================================================
# Maps per-bar condition dictionaries to registered classes.
#
# BATCH MODE: iterates through every unprocessed bar in the
# conditions history produced by conditions.py. The history is
# a list of dicts — one per bar, ordered oldest → newest — with
# a `_bar_dt` field identifying the bar.
#
# Falls back gracefully: if the history is a single dict (legacy
# behavior), it processes just that one bar. So this file works
# with the current conditions.py AND with the batch version.
#
# Entry point: python -m src.class_engine
#
# Class identity (defining elements):
#   regime.*, state.*, cot.*, sentiment.*
# Variation elements (not part of the identity):
#   ind.*, cal.*, news.*
#
# Class codes are assigned per (symbol, timeframe, version):
# A, B, C … Z, AA, AB … and are immutable once assigned.

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
    """
    Build a stable fingerprint from the defining elements that
    are TRUE. Sorted alphabetically so the string is deterministic.
    """
    active_defining = sorted(
        k for k, v in conditions.items()
        if v is True
        and not k.startswith("_")
        and k.startswith(DEFINING_PREFIXES)
    )
    return "|".join(active_defining)


def split_conditions(conditions: dict) -> dict:
    """Split the conditions dict into its four defining buckets."""
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
    """
    Load every class for (symbol, timeframe) once and index it by
    fingerprint. Avoids re-querying Supabase on every bar during
    batch processing.

    Returns:
      {
        "by_fp":    {fingerprint: class_row},
        "codes":    {class_code, ...},
        "count":    n,
      }
    """
    rows = fetch_existing_classes(symbol, timeframe, version)
    by_fp: dict[str, dict] = {}
    codes: set[str] = set()
    for row in rows:
        fp = reconstruct_fingerprint(row)
        if fp:
            by_fp[fp] = row
        if row.get("class_code"):
            codes.add(row["class_code"])
    return {"by_fp": by_fp, "codes": codes, "count": len(rows)}


# ============================================================
# CREATE / TOUCH
# ============================================================
def create_new_class(
    symbol: str,
    timeframe: str,
    conditions: dict,
    existing_codes: set[str],
    version: int = 1,
) -> dict | None:
    split = split_conditions(conditions)
    code = next_available_code(existing_codes)

    payload = {
        "class_code":         code,
        "symbol":             symbol,
        "timeframe":          timeframe,
        "regime":             split["regime"],
        "market_state":       split["state"],
        "cot":                split["cot"],
        "sentiment":          split["sentiment"],
        "definition_version": version,
        "occurrences":        1,
        "status":             "watching",
    }

    log.info("  Creating new class %s for %s %s: %s",
             code, symbol, timeframe, split["regime"])

    return sb.create_class(payload)


# ============================================================
# CONDITIONS HISTORY
# ============================================================
def load_conditions_history(symbol: str, timeframe: str) -> list[dict]:
    """
    Load the per-bar conditions history for (symbol, timeframe).

    Accepts three shapes for forward-compatibility:
      - list of dicts (batch mode — preferred)
      - single dict with `_bar_dt` (still processable)
      - single dict without `_bar_dt` (legacy — treated as latest bar)

    Returns a list of conditions dicts ordered oldest → newest.
    """
    key = f"run:{symbol}:{timeframe}:conditions"
    raw = rds.get_json(key)

    if raw is None:
        return []

    if isinstance(raw, list):
        # Batch mode: list of dicts
        return [c for c in raw if isinstance(c, dict)]

    if isinstance(raw, dict):
        # Single dict — wrap in a list
        return [raw]

    return []


# ============================================================
# MAIN PIPELINE
# ============================================================
def run() -> int:
    log.info("=== class_engine starting (batch mode) ===")

    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped. Exiting.")
        return 0

    sessions = sb.get_active_sessions()
    if not sessions:
        log.info("No active sessions. Exiting.")
        return 0

    total_processed = 0
    total_skipped = 0

    for s in sessions:
        symbol = s.get("symbol")
        timeframes = s.get("timeframes") or []
        if not symbol or not timeframes:
            continue

        for tf in timeframes:
            history = load_conditions_history(symbol, tf)
            if not history:
                log.debug("No conditions history for %s %s — skipping",
                          symbol, tf)
                continue

            # Build the class index once per (symbol, tf).
            # Cheap for the first cycle; reused for every bar.
            index = build_class_index(symbol, tf, version=1)
            log.info("  %s %s: %d bars in history, %d classes indexed",
                     symbol, tf, len(history), index["count"])

            last_processed = get_last_class_bar(symbol, tf)
            processed_this_tf = 0
            skipped_this_tf = 0

            for entry in history:
                bar_dt = entry.get("_bar_dt")
                if not bar_dt:
                    # Legacy single-dict shape with no timestamp —
                    # treat as the latest bar and process it once.
                    bar_dt = entry.get("_generated_at") or "latest"

                # Skip already-processed bars
                if last_processed and bar_dt <= last_processed:
                    skipped_this_tf += 1
                    continue

                fingerprint = build_fingerprint(entry)
                if not fingerprint:
                    # Empty fingerprint (all regime/state/cot/sentiment
                    # flags false) — advance the guard but do nothing.
                    mark_class_bar_processed(symbol, tf, bar_dt)
                    skipped_this_tf += 1
                    continue

                match = index["by_fp"].get(fingerprint)

                if match:
                    sb.touch_class(match["id"])
                    match["occurrences"] = (match.get("occurrences") or 0) + 1
                    processed_this_tf += 1
                else:
                    created = create_new_class(
                        symbol, tf, entry, index["codes"], version=1,
                    )
                    if created:
                        # Add to index so a subsequent identical bar
                        # doesn't create a duplicate class.
                        new_fp = reconstruct_fingerprint(created)
                        if new_fp:
                            index["by_fp"][new_fp] = created
                        if created.get("class_code"):
                            index["codes"].add(created["class_code"])
                        index["count"] += 1
                        processed_this_tf += 1
                    else:
                        log.warning("  ✘ %s %s: failed to create class",
                                    symbol, tf)
                        continue

                mark_class_bar_processed(symbol, tf, bar_dt)

            log.info("  ✔ %s %s: processed %d, skipped %d",
                     symbol, tf, processed_this_tf, skipped_this_tf)

            total_processed += processed_this_tf
            total_skipped += skipped_this_tf

    log.info("=== class_engine finished: %d processed, %d skipped ===",
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
        log.exception("class_engine failed: %s", e)
        sys.exit(1)
