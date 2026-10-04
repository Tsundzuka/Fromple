# ============================================================
# src/class_engine.py
# ============================================================
# Maps a condition dictionary (from Redis) to a registered
# class. If no matching class exists, one is created.
#
# Entry point: python -m src.class_engine
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
DEFINING_PREFIXES = ("regime.", "state.", "cot.", "sentiment.")
VARIATION_PREFIXES = ("ind.", "cal.", "news.")


# ============================================================
# FINGERPRINT
# ============================================================

def build_fingerprint(conditions: dict) -> str:
    """
    Build a stable fingerprint from the defining elements that
    are TRUE. Sorted alphabetically so the string is deterministic.

    Only defining keys (regime / state / cot / sentiment) are used.
    Indicators and calendar are variations — they describe the
    occurrence, not the class.
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
    """
    Split the conditions dict into its four defining buckets.
    Used when writing a new class row.
    """
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
    """
    Convert an index (0-based) to an alphabetic class code.
    0 → A, 1 → B, …, 25 → Z, 26 → AA, 27 → AB, …
    """
    n += 1
    result = ""
    while n > 0:
        n -= 1
        result = string.ascii_uppercase[n % 26] + result
        n //= 26
    return result


def next_available_code(existing_codes: set[str]) -> str:
    """Return the smallest unused alphabetic code."""
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
    """
    Fetch every class for (symbol, timeframe, version).
    Compared against the incoming fingerprint in Python.
    """
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
    """
    Rebuild the fingerprint from a stored class row. Uses the
    same canonical form the engine produces live.
    """
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
    """Return the class row whose fingerprint matches, or None."""
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
    """Create a new class row with the next available code."""
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
    """
    Execute one class-matching cycle. For every (symbol, timeframe)
    with conditions in Redis:
      - if a class matches → touch it
      - else → create a new one

    Returns the number of pairs processed.
    """
    log.info("=== class_engine starting ===")

    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped. Exiting.")
        return 0

    sessions = sb.get_active_sessions()
    if not sessions:
        log.info("No active sessions. Exiting.")
        return 0

    processed = 0

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

            match = find_matching_class(symbol, tf, fingerprint, version=1)

            if match:
                sb.touch_class(match["id"])
                log.info("  ✔ %s %s → Class %s (matched)",
                         symbol, tf, match["class_code"])
            else:
                existing = fetch_existing_classes(symbol, tf, version=1)
                existing_codes = {row["class_code"] for row in existing}
                created = create_new_class(
                    symbol, tf, conditions, existing_codes, version=1,
                )
                if created:
                    log.info("  ✔ %s %s → Class %s (new)",
                             symbol, tf, created["class_code"])
                else:
                    log.warning("  ✘ %s %s → failed to create class",
                                symbol, tf)

            # Stash the fingerprint in Redis for the signal engine
            rds.set_json(
                f"run:{symbol}:{tf}:fingerprint",
                {
                    "fingerprint": fingerprint,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                },
            )

            processed += 1

    log.info("=== class_engine finished: %d pairs processed ===", processed)
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
