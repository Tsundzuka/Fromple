# ============================================================
# src/cleanup.py
# ============================================================
# Deletes regeneratable Redis scratch keys after each pipeline cycle,
# and prunes M5 bars older than the retention window.
#
# Redis is a scratchpad, not storage. The registry lives in Supabase.
# This script removes derived timeframe bars, computed indicators,
# evaluated conditions, and class fingerprints — all regenerated on
# the next cycle — and trims the M5 list to a rolling 14-day window.
#
# PRESERVED across cycles (must survive):
#   run:{symbol}:M5:bars                 — source of truth for aggregation
#                                          (pruned to last 14 days)
#   run:{symbol}:W1:*                    — weekly, updates rarely
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
from datetime import datetime, timedelta, timezone

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

# How many days of M5 bars to retain in Redis. Anything older is
# pruned on every cleanup cycle. 14 days ≈ 4,032 bars at 24h/day,
# or ~2,880 bars accounting for forex weekend closures.
M5_RETENTION_DAYS = 14

# Timeframes whose full computed state is preserved across cycles.
# Their bars, indicators, conditions, and fingerprints are not deleted.
#
# M5  — source of truth for aggregation into every higher timeframe.
# W1  — updates once per week; regenerating every 5 min wastes CPU.
# MN1 — updates once per month; same reasoning as W1.
PRESERVED_TIMEFRAMES = {"M5", "W1", "MN1"}

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
def _parse_bar_dt(value: str) -> datetime | None:
    """Parse a bar datetime string like '2026-10-06 14:30:00' (UTC)."""
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(value).strip(), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def prune_m5(symbol: str) -> int:
    """
    Read M5 bars for one symbol, drop any older than the retention
    window, and write the trimmed list back. Returns the number of
    bars removed.
    """
    key = rds.bars_key(symbol, BASE_TIMEFRAME)
    bars = rds.get_json(key)
    if not isinstance(bars, list) or not bars:
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(days=M5_RETENTION_DAYS)

    kept = []
    for b in bars:
        dt = _parse_bar_dt(b.get("datetime"))
        if dt is None:
            continue  # malformed — drop it
        if dt >= cutoff:
            kept.append(b)

    removed = len(bars) - len(kept)
    if removed > 0:
        rds.set_json(key, kept)
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
    log.info("M5 retention: %d days", M5_RETENTION_DAYS)
    log.info("Preserved timeframes: %s", ", ".join(sorted(PRESERVED_TIMEFRAMES)))

    combos = active_combos()
    if not combos:
        log.info("No active (symbol, timeframe) combinations — nothing to clean.")
        return 0

    # Unique symbols across all combos
    symbols = sorted({sym for sym, _ in combos})

    # 1. Prune M5 bars older than the retention window
    total_pruned = 0
    for symbol in symbols:
        removed = prune_m5(symbol)
        total_pruned += removed
        if removed > 0:
            log.info("  %s M5: pruned %d bars older than %d days",
                     symbol, removed, M5_RETENTION_DAYS)

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
    log.info("M5 bars pruned: %d", total_pruned)
    log.info("Keys deleted: %d across %d combos", total_deleted, len(combos))
    log.info("Cleaned timeframes: %s", ", ".join(sorted(cleaned_tfs)) or "(none)")
    log.info("Preserved timeframes: %s", ", ".join(sorted(preserved_tfs)) or "(none)")
    return total_deleted + total_pruned


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
