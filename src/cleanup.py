# ============================================================
# src/cleanup.py
# ============================================================
# Deletes regeneratable Redis scratch keys after each pipeline cycle,
# and trims each base timeframe's bars to its capped count.
#
# Redis is a scratchpad, not storage. The registry lives in Supabase.
#
# BACKFILL GUARD: while backfill is still running for a symbol,
# its M5 list is left untouched. Backfill writes M5 history across
# many cycles; trimming it mid-backfill would delete bars that
# later cycles intend to use for aggregation.
#
# PRESERVED across cycles (must survive):
#   BASE timeframes — bars, indicators, conditions, fingerprint
#     M5   — source of truth for aggregation into M15–H8
#     H12  — fetched directly; updates twice a day
#     D1   — fetched directly; updates once a day
#     W1   — fetched directly; updates once a week
#     MN1  — fetched directly; updates once a month
#   run:{symbol}:{tf}:last_bar_dt        — fetch guard
#   run:{symbol}:{tf}:last_class_bar     — class engine guard
#   run:{symbol}:{tf}:last_processed_bar — signal engine guard
#
# DELETED every cycle (regeneratable):
#   DERIVED timeframes — bars, indicators, conditions, fingerprint
#     M15, M30, H1, H2, H4, H6, H8
#
# Entry point: python -m src.cleanup

import logging
import sys

from . import redis_client as rds
from . import supabase_client as sb

# ------------------------------------------------------------
# Logging
# ------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("cleanup")


# ------------------------------------------------------------
# Constants
# ------------------------------------------------------------
# Base timeframes: fetched by fetch_ohlcv.py, persist across cycles.
# The value is the maximum number of bars to keep per symbol.
# These caps must match fetch_ohlcv.py's MAX_BARS dict.
BASE_MAX_BARS = {
    "M5":  5_000,
    "H12": 1_000,
    "D1":  1_000,
    "W1":    500,
    "MN1":   200,
}

# Timeframes whose full state is preserved. Bars are trimmed, but
# the keys themselves never get deleted.
PRESERVED_TIMEFRAMES = set(BASE_MAX_BARS.keys())

# Derived timeframes: produced by aggregate.py, deleted each cycle.
DERIVED_TIMEFRAMES = {"M15", "M30", "H1", "H2", "H4", "H6", "H8"}

# Suffixes deleted each cycle for derived timeframes.
REGENERATABLE_SUFFIXES = (
    "bars",
    "indicators",
    "conditions",
    "fingerprint",
)


# ============================================================
# HELPERS
# ============================================================
def _backfill_done(symbol: str) -> bool:
    """
    True if backfill has finished for this symbol. The flag is set
    by backfill.py when its cursor reaches the present.
    """
    return bool(rds.get_json(f"run:{symbol}:M5:backfill_done"))


def trim_bars(symbol: str, timeframe: str, cap: int) -> int:
    """
    Trim the bars list for one (symbol, timeframe) to the newest
    `cap` entries. Returns the number of bars removed.

    Skips trimming M5 while backfill is still active for that
    symbol, so backfill and cleanup don't fight over the same list.
    """
    # Don't trim M5 while backfill is running for this symbol
    if timeframe == "M5" and not _backfill_done(symbol):
        return 0

    key = rds.bars_key(symbol, timeframe)
    bars = rds.get_json(key)
    if not isinstance(bars, list) or len(bars) <= cap:
        return 0

    trimmed = bars[-cap:]
    removed = len(bars) - len(trimmed)
    rds.set_json(key, trimmed)
    return removed


def active_combos() -> set[tuple[str, str]]:
    """
    Return the set of (symbol, timeframe) pairs the pipeline is
    currently configured to process, based on active sessions.
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


def cleanup_combo(symbol: str, timeframe: str) -> int:
    """
    Delete the regeneratable keys for one (symbol, timeframe) pair.

    Base timeframes are preserved. Derived timeframes have bars,
    indicators, conditions, and fingerprint removed.
    """
    if timeframe in PRESERVED_TIMEFRAMES:
        return 0

    deleted = 0
    for suffix in REGENERATABLE_SUFFIXES:
        key = f"run:{symbol}:{timeframe}:{suffix}"
        try:
            rds.delete(key)
            deleted += 1
        except Exception as e:
            log.warning("Failed to delete %s: %s", key, e)

    return deleted


# ============================================================
# MAIN
# ============================================================
def run() -> int:
    log.info("=== cleanup starting ===")
    log.info("Preserved timeframes: %s", ", ".join(sorted(PRESERVED_TIMEFRAMES)))
    log.info("Derived (cleaned): %s", ", ".join(sorted(DERIVED_TIMEFRAMES)))

    combos = active_combos()
    if not combos:
        log.info("No active (symbol, timeframe) combinations — nothing to clean.")
        return 0

    symbols = sorted({sym for sym, _ in combos})

    # 1. Trim base timeframe bars to their per-timeframe caps.
    #    M5 is skipped for any symbol whose backfill hasn't completed.
    total_trimmed = 0
    for symbol in symbols:
        for tf, cap in BASE_MAX_BARS.items():
            if tf == "M5" and not _backfill_done(symbol):
                log.debug("  %s M5: backfill active — skipping trim", symbol)
                continue
            removed = trim_bars(symbol, tf, cap)
            total_trimmed += removed
            if removed > 0:
                log.info("  %s %s: trimmed %d bars (kept %d)",
                         symbol, tf, removed, cap)

    # 2. Delete scratch keys for derived timeframes
    total_deleted = 0
    cleaned_tfs: set[str] = set()
    preserved_tfs: set[str] = set()

    for symbol, tf in sorted(combos):
        n = cleanup_combo(symbol, tf)
        total_deleted += n
        if n > 0:
            cleaned_tfs.add(tf)
        else:
            preserved_tfs.add(tf)

    log.info("=== cleanup finished ===")
    log.info("Bars trimmed: %d", total_trimmed)
    log.info("Keys deleted: %d across %d combos", total_deleted, len(combos))
    log.info("Cleaned timeframes: %s", ", ".join(sorted(cleaned_tfs)) or "(none)")
    log.info("Preserved timeframes: %s", ", ".join(sorted(preserved_tfs)) or "(none)")
    return total_deleted + total_trimmed


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        run()
        sys.exit(0)
    except Exception as e:
        log.exception("cleanup failed: %s", e)
        sys.exit(1)
