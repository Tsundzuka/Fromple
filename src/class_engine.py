# ============================================================
# src/class_engine.py
# ============================================================
# Maps a condition dictionary (from Redis) to a registered
# class. If no matching class exists, one is created.
#
# Entry point: python -m src.class_engine
#
# Per-bar guard: occurrences increment once per new bar, not
# once per pipeline cycle. A cycle runs every 5 minutes; bars
# arrive every 5 minutes (M5) or slower. Without the guard,
# a single H1 bar would increment the class 12 times.
#
# Defining elements (class identity):
#   regime.*     — uptrend / downtrend / consolidating
#   state.*      — support, resistance, range position, volume,
#                  volatility, wick behaviour
#   cot.*        — net long/short, weekly change, extremes
#   sentiment.*  — news events, non-calendar sentiment
#
# Variation elements (do NOT define the class):
#   ind.*        — indicator confirmations
#   cal.*        — economic calendar proximity
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
# Distinct key from signal_engine's guard so both stages can
# process the same bar without blocking each other.

def _class_bar_key(symbol: str, timeframe: str) -> str:
    return f"run:{symbol}:{timeframe}:last_class_bar"


def class_bar_already_processed(symbol: str, timeframe: str, bar_dt: str) -> bool:
    return rds.get_json(_class_bar_key(symbol, timeframe)) == bar_dt


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


def build_variation_snapshot(conditions: dict) -> dict:
    """Snapshot which variation elements fired this occurrence."""
    return {
        k: bool(v)
        for k, v in conditions.items()
        if not k.startswith("_") and k.startswith(VARIATION_PREFIXES)
    }


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


def find_matching_class(
    symbol: str,
    timeframe: str,
    fingerprint: str,
    version: int = 1,
) -> dict | None:
    classes = fetch_existing_classes(symbol, timeframe, version)
    for row in classes:
        if reconstruct_fingerprint(row) == fingerprint:
            return row
    return None


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

    log.info("Creating new class %s for %s %s: %s",
             code, symbol, timeframe, split["regime"])

    return sb.create_class(payload)


# ============================================================
# MAIN PIPELINE
# ============================================================

def run() -> int:
    log.info("=== class_engine starting ===")

    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped. Exiting.")
        return 0

    sessions = sb.get_active_sessions()
    if not sessions:
        log.info("No active sessions. Exiting.")
        return 0

    processed = 0
    skipped = 0

    for s in sessions:
        symbol = s.get("symbol")
        timeframes = s.get("timeframes") or []
        if not symbol or not timeframes:
            continue

        for tf in timeframes:
            conditions = rds.load_conditions(symbol, tf)
            if not conditions or not conditions.get("_context"):
                log.debug("No conditions for %s %s — skipping", symbol, tf)
                continue

            fingerprint = build_fingerprint(conditions)
            if not fingerprint:
                log.debug("Empty fingerprint for %s %s — skipping", symbol, tf)
                continue

            # Always stash the fingerprint — the signal engine
            # reads it every cycle regardless of bar freshness.
            rds.set_json(
                f"run:{symbol}:{tf}:fingerprint",
                {
                    "fingerprint": fingerprint,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                },
            )

            # --- Per-bar guard ---
            bars = rds.load_bars(symbol, tf)
            if not bars:
                log.debug("No bars for %s %s — skipping", symbol, tf)
                continue
            last_bar_dt = bars[-1].get("datetime")
            if not last_bar_dt:
                continue

            if class_bar_already_processed(symbol, tf, last_bar_dt):
                log.debug("Bar already processed for %s %s — skipping increment",
                          symbol, tf)
                skipped += 1
                continue

            # --- Actual class matching / incrementing ---
            match = find_matching_class(symbol, tf, fingerprint, version=1)

            if match:
                sb.touch_class(match["id"])
                log.info("  ✔ %s %s → Class %s (matched, occurrences → %d)",
                         symbol, tf, match["class_code"],
                         (match.get("occurrences") or 0) + 1)
            else:
                existing = fetch_existing_classes(symbol, tf, version=1)
                existing_codes = {row["class_code"] for row in existing}
                created = create_new_class(
                    symbol, tf, conditions, existing_codes, version=1,
                )
                if created:
                    log.info("  ✔ %s %s → Class %s (new, occurrences = 1)",
                             symbol, tf, created["class_code"])
                else:
                    log.warning("  ✘ %s %s → failed to create class",
                                symbol, tf)
                    continue

            mark_class_bar_processed(symbol, tf, last_bar_dt)
            processed += 1

    log.info("=== class_engine finished: %d processed, %d skipped (same bar) ===",
             processed, skipped)
    return processed


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
