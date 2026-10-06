# ============================================================
# src/backfill.py
# ============================================================
# Sequential historical backfill for M5 bars.
#
# Runs hourly. Each run:
#   1. Reads the backfill cursor for each symbol from Redis
#      (on first run, calls /earliest_timestamp to seed it)
#   2. Fetches one window of up to 5,000 bars starting from the cursor
#   3. Merges those bars into the M5 list for the symbol
#   4. Advances the cursor to the newest bar received
#   5. If the window returned fewer bars than requested, or the newest
#      bar is within DONE_WINDOW_HOURS of now, marks the symbol as done
#
# Once a symbol is marked done, subsequent runs skip it entirely.
#
# Idempotent: merging is dedupe-by-datetime, so re-runs on the same
# window are safe.
#
# Entry point: python -m src.backfill

import logging
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

from . import config
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
log = logging.getLogger("backfill")


# ------------------------------------------------------------
# Constants
# ------------------------------------------------------------
BACKFILL_TIMEFRAME = "M5"
BACKFILL_INTERVAL  = "5min"

# Bars per request. 5,000 is Twelve Data's hard max.
WINDOW_SIZE = 5000

# Respect the free tier's 8 requests/minute limit.
SECONDS_BETWEEN_CALLS = 8

# If the newest bar returned is within this window of "now",
# consider the symbol fully backfilled.
DONE_WINDOW_HOURS = 2

# How long the cursor and done-flag keys survive in Redis.
# Long enough to outlive any reasonable backfill effort.
BACKFILL_KEY_TTL_SECONDS = 400 * 24 * 60 * 60  # 400 days


# ------------------------------------------------------------
# Key helpers
# ------------------------------------------------------------
def _cursor_key(symbol: str) -> str:
    return f"run:{symbol}:{BACKFILL_TIMEFRAME}:backfill_cursor"


def _done_key(symbol: str) -> str:
    return f"run:{symbol}:{BACKFILL_TIMEFRAME}:backfill_done"


# ------------------------------------------------------------
# Datetime parsing
# ------------------------------------------------------------
def _parse_dt(value: str) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(value).strip(), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


# ------------------------------------------------------------
# Twelve Data calls
# ------------------------------------------------------------
def fetch_earliest_timestamp(provider_symbol: str) -> datetime | None:
    """
    Ask Twelve Data for the earliest available M5 bar for a symbol.
    Returns a UTC datetime, or None on failure.
    """
    url = f"{config.TWELVEDATA_BASE_URL}/earliest_timestamp"
    params = {
        "symbol":   provider_symbol,
        "interval": BACKFILL_INTERVAL,
        "apikey":   config.TWELVEDATA_API_KEY,
    }
    try:
        resp = requests.get(url, params=params, timeout=20)
        resp.raise_for_status()
        payload = resp.json()
    except requests.RequestException as e:
        log.warning("earliest_timestamp request failed for %s: %s", provider_symbol, e)
        return None

    if isinstance(payload, dict) and payload.get("status") == "error":
        log.warning("earliest_timestamp error for %s: %s",
                    provider_symbol, payload.get("message"))
        return None

    raw = payload.get("datetime") if isinstance(payload, dict) else None
    return _parse_dt(raw)


def fetch_window(provider_symbol: str, start_dt: datetime) -> list[dict]:
    """
    Fetch up to WINDOW_SIZE M5 bars starting from start_dt.
    Returns a list of bars (oldest → newest), or [] on failure.
    """
    url = f"{config.TWELVEDATA_BASE_URL}/time_series"
    params = {
        "symbol":     provider_symbol,
        "interval":   BACKFILL_INTERVAL,
        "start_date": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "outputsize": WINDOW_SIZE,
        "order":      "ASC",
        "apikey":     config.TWELVEDATA_API_KEY,
        "format":     "JSON",
    }

    for attempt in (1, 2):
        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            payload = resp.json()
        except requests.RequestException as e:
            log.warning("backfill window request failed (%s attempt %d): %s",
                        provider_symbol, attempt, e)
            if attempt == 1:
                time.sleep(3)
                continue
            return []

        if isinstance(payload, dict) and payload.get("status") == "error":
            log.warning("backfill window error for %s: %s",
                        provider_symbol, payload.get("message"))
            if attempt == 1:
                time.sleep(10)
                continue
            return []

        values = payload.get("values") if isinstance(payload, dict) else None
        if not values:
            return []

        bars: list[dict] = []
        for v in values:
            try:
                bars.append({
                    "datetime": v["datetime"],
                    "open":     float(v["open"]),
                    "high":     float(v["high"]),
                    "low":      float(v["low"]),
                    "close":    float(v["close"]),
                    "volume":   float(v.get("volume") or 0),
                })
            except (KeyError, ValueError, TypeError) as e:
                log.warning("Skipping malformed backfill bar for %s: %s",
                            provider_symbol, e)

        return bars

    return []


# ------------------------------------------------------------
# Merge into M5 list
# ------------------------------------------------------------
def merge_into_m5(symbol: str, new_bars: list[dict]) -> int:
    """
    Merge new bars into the symbol's M5 list in Redis. Returns the
    total number of M5 bars after the merge.
    """
    key = rds.bars_key(symbol, BACKFILL_TIMEFRAME)
    existing = rds.get_json(key)
    if not isinstance(existing, list):
        existing = []

    by_dt: dict[str, dict] = {b["datetime"]: b for b in existing if "datetime" in b}
    for b in new_bars:
        if "datetime" in b:
            by_dt[b["datetime"]] = b

    merged = sorted(by_dt.values(), key=lambda b: b["datetime"])
    rds.set_json(key, merged)
    return len(merged)


# ------------------------------------------------------------
# Main
# ------------------------------------------------------------
def run() -> int:
    log.info("=== backfill starting ===")

    config.require(
        "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
        "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
        "TWELVEDATA_API_KEY",
    )

    instruments = sb.get_active_instruments()
    sessions = sb.get_active_sessions()

    if not instruments:
        log.warning("No active instruments — exiting.")
        return 0
    if not sessions:
        log.info("No active sessions — exiting.")
        return 0

    # Unique symbols we're configured to track
    symbols = sorted({s["symbol"] for s in sessions if s.get("symbol")})
    if not symbols:
        log.info("No symbols in sessions — exiting.")
        return 0

    now_utc = datetime.now(timezone.utc)
    done_cutoff = now_utc - timedelta(hours=DONE_WINDOW_HOURS)

    total_added = 0
    progressed = 0
    all_done = True

    for symbol in symbols:
        # Check done flag
        if rds.get_json(_done_key(symbol)):
            log.debug("  %s: already done — skipping", symbol)
            continue

        all_done = False

        provider_symbol = instruments.get(symbol)
        if not provider_symbol:
            log.warning("  %s: no provider_symbol — skipping", symbol)
            continue

        # 1. Determine start point
        cursor_raw = rds.get_json(_cursor_key(symbol))
        start_dt = _parse_dt(cursor_raw) if cursor_raw else None

        if start_dt is None:
            log.info("  %s: no cursor — querying earliest_timestamp", symbol)
            start_dt = fetch_earliest_timestamp(provider_symbol)
            sb.increment_api_usage(provider="twelvedata", by=1, limit_value=800)
            time.sleep(SECONDS_BETWEEN_CALLS)

            if start_dt is None:
                log.warning("  %s: could not determine earliest timestamp — skipping", symbol)
                continue

            log.info("  %s: earliest M5 bar is %s", symbol, start_dt.date())

        # 2. Fetch one window
        log.info("  %s: fetching window from %s", symbol, start_dt)
        bars = fetch_window(provider_symbol, start_dt)
        sb.increment_api_usage(provider="twelvedata", by=1, limit_value=800)

        if not bars:
            log.warning("  %s: empty window — marking done", symbol)
            rds.set_json(_done_key(symbol), True, ttl_seconds=BACKFILL_KEY_TTL_SECONDS)
            time.sleep(SECONDS_BETWEEN_CALLS)
            continue

        # 3. Merge into M5
        total = merge_into_m5(symbol, bars)
        total_added += len(bars)
        progressed += 1

        newest_dt = _parse_dt(bars[-1].get("datetime"))

        # 4. Advance cursor
        if newest_dt:
            rds.set_json(
                _cursor_key(symbol),
                newest_dt.strftime("%Y-%m-%d %H:%M:%S"),
                ttl_seconds=BACKFILL_KEY_TTL_SECONDS,
            )

        log.info("  %s: +%d bars (total %d), cursor → %s",
                 symbol, len(bars), total, newest_dt)

        # 5. Done detection
        reached_present = (
            len(bars) < WINDOW_SIZE
            or (newest_dt is not None and newest_dt >= done_cutoff)
        )
        if reached_present:
            log.info("  %s: reached present — marking done", symbol)
            rds.set_json(_done_key(symbol), True, ttl_seconds=BACKFILL_KEY_TTL_SECONDS)

        time.sleep(SECONDS_BETWEEN_CALLS)

    if all_done:
        log.info("All symbols backfilled — nothing to do.")
    else:
        log.info("=== backfill finished: %d symbols progressed, %d bars added ===",
                 progressed, total_added)

    return total_added


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        run()
        sys.exit(0)
    except Exception as e:
        log.exception("backfill failed: %s", e)
        sys.exit(1)
