# ============================================================
# src/aggregate.py
# ============================================================
# Derives higher timeframe OHLCV bars from M5 bars in Redis.
#
# Runs immediately after fetch_ohlcv.py, before indicators.py.
#
# For each session symbol:
#   1. Read M5 bars from Redis (run:{symbol}:M5:bars)
#   2. For each timeframe listed on the session (except M5):
#        - Aggregate M5 into buckets of the target duration
#        - Only write if at least MIN_BARS_REQUIRED bars produced
#        - Save to run:{symbol}:{tf}:bars with 365-day TTL
#
# Bucket boundaries:
#   - Intraday (M15..H12): epoch-aligned (00:00 UTC start)
#   - D1: 00:00 UTC
#   - W1: Monday 00:00 UTC
#
# Entry point: python -m src.aggregate

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
log = logging.getLogger("aggregate")


# ------------------------------------------------------------
# Constants
# ------------------------------------------------------------
BASE_TIMEFRAME = "M5"

# Minimum bars required in the target timeframe before writing.
# 50 covers SMA50. Bump if you add longer-period indicators.
MIN_BARS_REQUIRED = 50

# TTL on derived keys — same as M5.
DERIVED_TTL_SECONDS = 365 * 24 * 60 * 60


# ============================================================
# DATETIME HELPERS
# ============================================================
def _parse_bar_dt(value: str) -> datetime | None:
    """Parse a bar datetime string like '2026-10-06 14:30:00' (UTC)."""
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(str(value).strip(), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _bucket_start(dt: datetime, minutes: int) -> datetime:
    """
    Floor a UTC datetime to the start of its aggregation bucket.

    - Intraday and D1 use Unix-epoch alignment (minute 0 = 00:00 UTC,
      which is exactly what we want).
    - W1 uses Monday-based weeks, since epoch-aligned weeks would
      start on Thursdays.
    """
    if minutes >= 10080:  # 1 week or longer
        # Monday-based week
        monday = dt - timedelta(days=dt.weekday())
        return monday.replace(hour=0, minute=0, second=0, microsecond=0)

    epoch_seconds = int(dt.timestamp())
    bucket_seconds = (epoch_seconds // (minutes * 60)) * (minutes * 60)
    return datetime.fromtimestamp(bucket_seconds, tz=timezone.utc)


# ============================================================
# AGGREGATION
# ============================================================
def aggregate_bars(m5_bars: list[dict], target_minutes: int) -> list[dict]:
    """
    Group M5 bars into buckets of `target_minutes` and produce
    OHLCV bars for each bucket. Bars without a valid datetime are
    skipped. Returns oldest → newest.
    """
    buckets: dict[str, dict] = {}

    for bar in m5_bars:
        try:
            dt = _parse_bar_dt(bar.get("datetime"))
            if dt is None:
                continue

            o = float(bar["open"])
            h = float(bar["high"])
            l = float(bar["low"])
            c = float(bar["close"])
            v = float(bar.get("volume") or 0)
        except (KeyError, ValueError, TypeError):
            continue

        bucket_dt = _bucket_start(dt, target_minutes)
        key = bucket_dt.strftime("%Y-%m-%d %H:%M:%S")

        existing = buckets.get(key)
        if existing is None:
            buckets[key] = {
                "datetime": key,
                "open":     o,
                "high":     h,
                "low":      l,
                "close":    c,
                "volume":   v,
            }
        else:
            existing["high"] = max(existing["high"], h)
            existing["low"]  = min(existing["low"],  l)
            existing["close"] = c
            existing["volume"] += v

    return sorted(buckets.values(), key=lambda b: b["datetime"])


# ============================================================
# MAIN
# ============================================================
def run() -> int:
    log.info("=== aggregate starting ===")

    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped — exiting.")
        return 0

    timeframes = sb.get_timeframe_map()
    if not timeframes:
        log.warning("No timeframe registry — exiting.")
        return 0

    sessions = sb.get_active_sessions()
    if not sessions:
        log.info("No active sessions — exiting.")
        return 0

    # Group sessions by symbol so we don't aggregate twice for the
    # same symbol if multiple users share it.
    symbol_tfs: dict[str, set[str]] = {}
    for s in sessions:
        symbol = s.get("symbol")
        if not symbol:
            continue
        tfs = s.get("timeframes") or []
        symbol_tfs.setdefault(symbol, set()).update(tfs)

    if not symbol_tfs:
        log.info("No symbols with configured timeframes — exiting.")
        return 0

    total_written = 0

    for symbol, tf_set in sorted(symbol_tfs.items()):
        m5_key = rds.bars_key(symbol, BASE_TIMEFRAME)
        m5_bars = rds.get_json(m5_key) or []

        if not isinstance(m5_bars, list) or not m5_bars:
            log.info("  %s: no M5 bars in Redis — skipping", symbol)
            continue

        log.info("  %s: %d M5 bars available", symbol, len(m5_bars))

        # Determine which derived timeframes to produce.
        derived = sorted(
            tf for tf in tf_set
            if tf != BASE_TIMEFRAME and tf in timeframes
        )

        if not derived:
            log.info("  %s: no derived timeframes configured", symbol)
            continue

        for tf in derived:
            meta = timeframes[tf]
            duration = int(meta["duration_minutes"])

            agg = aggregate_bars(m5_bars, duration)

            if len(agg) < MIN_BARS_REQUIRED:
                log.info(
                    "  %s %s: only %d bars (< %d) — skipping",
                    symbol, tf, len(agg), MIN_BARS_REQUIRED,
                )
                continue

            key = rds.bars_key(symbol, tf)
            rds.set_json(key, agg, ttl_seconds=DERIVED_TTL_SECONDS)
            total_written += 1
            log.info(
                "  %s %s: aggregated %d bars from %d M5 bars",
                symbol, tf, len(agg), len(m5_bars),
            )

    log.info("=== aggregate finished: %d timeframe(s) written ===", total_written)
    return total_written


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        run()
        sys.exit(0)
    except Exception as e:
        log.exception("aggregate failed: %s", e)
        sys.exit(1)
