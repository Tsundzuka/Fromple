# ============================================================
# src/cleanup.py
# ============================================================
# Deletes regeneratable Redis scratch keys after each pipeline cycle,
# and trims M5 bars to a fixed count per symbol.
#
# Redis is a scratchpad, not storage. The registry lives in Supabase.
#
# PRESERVED across cycles (must survive):
#   run:{symbol}:M5:bars                 — source of truth for aggregation
#                                          (trimmed to last M5_MAX_BARS)
#   run:{symbol}:W1:*                    — weekly, updates rarely
#   run:{symbol}:D1:*                    — daily, updates once per day
#   run:{symbol}:MN1:*                   — monthly, updates rarely
#   run:{symbol}:{tf}:last_bar_dt        — fetch guard
#   run:{symbol}:{tf}:last_class_bar     — class engine guard
#   run:{symbol}:{tf}:last_processed_bar — signal engine guard
#
# DELETED every cycle (regeneratable):
#   run:{symbol}:{tf}:bars               — for tf not in PRESERVED
#   run:{symbol}:{tf}:indicators         — for tf not in PRESERVED
#   run:{symbol}:{tf}:conditions         — for tf not in PRESERVED
#   run:{symbol}:{tf}:fingerprint        — for tf not in PRESERVED
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
BASE_TIMEFRAME = "M5"

# Number of M5 bars to retain per symbol. Matches Twelve Data's
# per-request maximum, so a single refetch could reseed this window.
# 5,000 M5 bars ≈ 17 calendar days of 24h forex trading.
M5_MAX_BARS = 5000

# Timeframes whose full computed state is preserved across cycles.
# Their bars, indicators, conditions, and fingerprints are not deleted.
PRESERVED_TIMEFRAMES = {"M5", "W1", "D1", "MN1"}

# Suffixes deleted each cycle, for timeframes NOT in PRESERVED_TIMEFRAMES.
REGENERATABLE_SUFFIXES = (
    "bars",
    "indicators",
    "conditions",
    "fingerprint",
)


# ============================================================
# HELPERS
# ============================================================
def trim_m5(symbol: str) -> int:
    """
    Trim the M5 bars list for one symbol to the newest M5_MAX_BARS
    entries. Returns the number of bars removed.
    """
    key = rds.bars_key(symbol, BASE_TIMEFRAME)
    bars = rds.get_json(key)
    if not isinstance(bars, list) or len(bars) <= M5_MAX_BARS:
        return 0

    trimmed = bars[-M5_MAX_BARS:]
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

    If the timeframe is in PRESERVED_TIMEFRAMES, nothing is deleted.
    Otherwise, bars + indicators + conditions + fingerprint are removed.
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
    log.info("M5 retention: %d bars per symbol", M5_MAX_BARS)
    log.info("Preserved timeframes: %s", ", ".join(sorted(PRESERVED_TIMEFRAMES)))

    combos = active_combos()
    if not combos:
        log.info("No active (symbol, timeframe) combinations — nothing to clean.")
        return 0

    symbols = sorted({sym for sym, _ in combos})

    # 1. Trim M5 to the fixed bar count
    total_trimmed = 0
    for symbol in symbols:
        removed = trim_m5(symbol)
        total_trimmed += removed
        if removed > 0:
            log.info("  %s M5: trimmed %d bars (kept %d)",
                     symbol, removed, M5_MAX_BARS)

    # 2. Delete scratch keys for non-preserved timeframes
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
    log.info("M5 bars trimmed: %d", total_trimmed)
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
