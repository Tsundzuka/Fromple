"""
src/cleanup.py — Delete regeneratable Redis scratch keys after each
pipeline cycle.

Redis is a scratchpad, not storage. The registry lives in Supabase.
This script removes the raw bars, computed indicators, evaluated
conditions, and class fingerprints from the previous cycle, while
preserving the small set of guard keys that must survive across runs:

  Preserved (guards):
    run:{symbol}:{tf}:last_bar_dt        — fetch guard
    run:{symbol}:{tf}:last_class_bar     — class engine guard
    run:{symbol}:{tf}:last_processed_bar — signal engine guard

  Deleted (regeneratable):
    run:{symbol}:{tf}:bars
    run:{symbol}:{tf}:indicators
    run:{symbol}:{tf}:conditions
    run:{symbol}:{tf}:fingerprint

Without this, Redis grows unbounded and exhausts Upstash's free tier
within days once the pipeline is running on the 5-minute cron.

The set of (symbol, timeframe) pairs to clean is derived from active
sessions in Supabase — not hardcoded. Adding a new instrument or
timeframe via the GUI is automatically picked up on the next run.
"""

import logging

from src import config
from src.redis_client import RedisClient
from src.supabase_client import SupabaseClient

log = logging.getLogger(__name__)


# ------------------------------------------------------------
# Key suffixes
# ------------------------------------------------------------
# Deleted every cycle. Safe to regenerate from the next OHLCV fetch.
REGENERATABLE_SUFFIXES = (
    "bars",
    "indicators",
    "conditions",
    "fingerprint",
)

# Preserved across cycles. The pipeline reads these to decide whether
# to fetch, match a class, or fire a signal.
PRESERVED_SUFFIXES = (
    "last_bar_dt",
    "last_class_bar",
    "last_processed_bar",
)


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
def active_combos(sb: SupabaseClient) -> set[tuple[str, str]]:
    """
    Return the set of (symbol, timeframe) pairs the pipeline is
    currently configured to process, based on active sessions.

    A session can list multiple timeframes (e.g. ["M5", "M15"]), so
    one session row may produce several combos. Timeframes that are
    not in the active timeframe registry are skipped.
    """
    sessions = sb.get_active_sessions()
    tf_map = sb.get_timeframe_map()

    combos: set[tuple[str, str]] = set()
    for s in sessions:
        symbol = s.get("symbol")
        tfs = s.get("timeframes") or []
        if not symbol or not isinstance(tfs, list):
            continue
        for tf in tfs:
            if tf in tf_map:
                combos.add((symbol, tf))

    return combos


def cleanup_combo(rc: RedisClient, symbol: str, timeframe: str) -> int:
    """
    Delete the regeneratable keys for one (symbol, timeframe) pair.
    Returns the number of keys successfully deleted.
    """
    deleted = 0
    for suffix in REGENERATABLE_SUFFIXES:
        key = f"run:{symbol}:{timeframe}:{suffix}"
        try:
            rc.delete(key)
            deleted += 1
        except Exception as e:
            log.warning("cleanup failed for key %s: %s", key, e)
    return deleted


# ------------------------------------------------------------
# Main
# ------------------------------------------------------------
def main() -> None:
    config.require(
        "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
        "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
    )

    sb = SupabaseClient()
    rc = RedisClient()

    combos = active_combos(sb)
    if not combos:
        print("No active (symbol, timeframe) combinations — nothing to clean")
        return

    total = 0
    for symbol, tf in sorted(combos):
        n = cleanup_combo(rc, symbol, tf)
        total += n
        print(f"  {symbol} {tf}: {n}/{len(REGENERATABLE_SUFFIXES)} keys deleted")

    print(
        f"Cleanup complete — {total} keys deleted "
        f"across {len(combos)} (symbol, timeframe) pairs"
    )
    print(f"Preserved guards: {', '.join(PRESERVED_SUFFIXES)}")


if __name__ == "__main__":
    main()c
