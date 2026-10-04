# ============================================================
# src/fetch_ohlcv.py
# ============================================================
# Fetches OHLCV bars from Twelve Data for every instrument
# whose session window currently contains the UTC time, and
# writes them to Upstash Redis.
#
# Entry point: python -m src.fetch_ohlcv
#
# Flow:
#   1. Exit immediately if system_state.is_running = false
#   2. Load active sessions from Supabase
#   3. For each session whose UTC window contains "now":
#         for each timeframe enabled on that session:
#             fetch bars from Twelve Data
#             write to Redis
#             increment api_usage
#   4. Stamp system_state.last_successful_run

import logging
import sys
import time
from datetime import datetime, time as dtime, timezone
from typing import Any

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
log = logging.getLogger("fetch_ohlcv")


# ------------------------------------------------------------
# Symbol mapping (Supabase symbol → Twelve Data symbol)
# ------------------------------------------------------------
TWELVEDATA_SYMBOL_MAP = {
    "EUR/USD": "EUR/USD",
    "AUD/USD": "AUD/USD",
    "USD/CHF": "USD/CHF",
    "USD/CAD": "USD/CAD",
    "DXY":     "DXY",
}


# ------------------------------------------------------------
# Timeframe mapping (Supabase tf → Twelve Data interval)
# ------------------------------------------------------------
TWELVEDATA_INTERVAL_MAP = {
    "M1":  "1min",
    "M5":  "5min",
    "M15": "15min",
    "M30": "30min",
    "H1":  "1h",
    "H2":  "2h",
    "H4":  "4h",
    "H6":  "6h",
    "H8":  "8h",
    "H12": "12h",
    "D1":  "1day",
    "W1":  "1week",
}


# ------------------------------------------------------------
# Rate limiting
# ------------------------------------------------------------
# Twelve Data free tier: 8 requests/minute. We sleep between
# calls to stay comfortably under that. Adjust if you upgrade.
SECONDS_BETWEEN_CALLS = 8


# ------------------------------------------------------------
# Session window check
# ------------------------------------------------------------
def _parse_time(value: Any) -> dtime | None:
    """Parse an 'HH:MM' or 'HH:MM:SS' string into a time object."""
    if value is None:
        return None
    s = str(value)
    parts = s.split(":")
    if len(parts) < 2:
        return None
    try:
        h = int(parts[0])
        m = int(parts[1])
        return dtime(hour=h, minute=m, tzinfo=timezone.utc)
    except ValueError:
        return None


def is_within_window(now_utc: datetime, start: dtime | None, end: dtime | None) -> bool:
    """
    Return True if now_utc is inside the session window.
    Handles overnight windows (start > end).
    """
    if start is None or end is None:
        return False

    t = now_utc.timetz()

    if start <= end:
        # Normal window, e.g. 08:00 – 17:00
        return start <= t <= end
    else:
        # Overnight window, e.g. 23:00 – 08:00
        return t >= start or t <= end


# ------------------------------------------------------------
# Twelve Data fetch
# ------------------------------------------------------------
def fetch_bars(symbol: str, timeframe: str, outputsize: int) -> list[dict]:
    """
    Fetch OHLCV bars from Twelve Data. Returns a list of dicts
    sorted oldest → newest. Returns [] on failure.
    """
    td_symbol = TWELVEDATA_SYMBOL_MAP.get(symbol)
    if not td_symbol:
        log.warning("No Twelve Data mapping for symbol: %s", symbol)
        return []

    td_interval = TWELVEDATA_INTERVAL_MAP.get(timeframe)
    if not td_interval:
        log.warning("No Twelve Data mapping for timeframe: %s", timeframe)
        return []

    url = f"{config.TWELVEDATA_BASE_URL}/time_series"
    params = {
        "symbol":     td_symbol,
        "interval":   td_interval,
        "outputsize": outputsize,
        "apikey":     config.TWELVEDATA_API_KEY,
        "order":      "ASC",
        "format":     "JSON",
    }

    for attempt in (1, 2):
        try:
            resp = requests.get(url, params=params, timeout=20)
            resp.raise_for_status()
            payload = resp.json()
        except requests.RequestException as e:
            log.warning("Twelve Data request failed (%s attempt %d): %s", symbol, attempt, e)
            if attempt == 1:
                time.sleep(3)
                continue
            return []

        # Twelve Data returns {"code": 429, "message": "..."} on rate limit
        if isinstance(payload, dict) and payload.get("status") == "error":
            log.warning("Twelve Data error for %s %s: %s", symbol, timeframe, payload.get("message"))
            if attempt == 1:
                time.sleep(10)
                continue
            return []

        values = payload.get("values") if isinstance(payload, dict) else None
        if not values:
            log.warning("Twelve Data returned no bars for %s %s", symbol, timeframe)
            return []

        # Normalise into our shape. Twelve Data returns strings.
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
                log.warning("Skipping malformed bar for %s: %s", symbol, e)

        return bars

    return []


# ------------------------------------------------------------
# Main pipeline
# ------------------------------------------------------------
def run() -> int:
    """
    Execute one fetch cycle. Returns the number of successful
    (symbol, timeframe) fetches performed.
    """
    log.info("=== fetch_ohlcv starting ===")

    # 1. Gate on system_state
    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped (system_state.is_running = false). Exiting.")
        return 0

    # 2. Load sessions
    sessions = sb.get_active_sessions()
    if not sessions:
        log.info("No active sessions. Exiting.")
        return 0

    now_utc = datetime.now(timezone.utc)
    log.info("Current UTC time: %s", now_utc.strftime("%Y-%m-%d %H:%M:%S"))

    # 3. Filter sessions that are within their window right now
    due_sessions: list[dict] = []
    for s in sessions:
        start = _parse_time(s.get("start_utc"))
        end   = _parse_time(s.get("end_utc"))
        if is_within_window(now_utc, start, end):
            due_sessions.append(s)
        else:
            log.debug("Skipping %s — outside window %s–%s",
                      s.get("symbol"), s.get("start_utc"), s.get("end_utc"))

    if not due_sessions:
        log.info("No instruments in their tradeable window. Exiting.")
        return 0

    log.info("In-window instruments: %s", ", ".join(s.get("symbol", "?") for s in due_sessions))

    # 4. For each session, fetch every enabled timeframe
    fetched = 0
    for s in due_sessions:
        symbol = s.get("symbol")
        timeframes = s.get("timeframes") or []
        if not symbol or not timeframes:
            continue

        for tf in timeframes:
            log.info("Fetching %s %s (%d bars)…", symbol, tf, config.BARS_PER_FETCH)
            bars = fetch_bars(symbol, tf, config.BARS_PER_FETCH)

            if bars:
                rds.save_bars(symbol, tf, bars)
                log.info("  ✔ Saved %d bars to Redis: %s", len(bars), rds.bars_key(symbol, tf))
                fetched += 1
            else:
                log.warning("  ✘ No bars written for %s %s", symbol, tf)

            # Increment usage regardless of success (Twelve Data counts the call)
            sb.increment_api_usage(provider="twelvedata", by=1, limit_value=800)

            # Rate limit
            time.sleep(SECONDS_BETWEEN_CALLS)

    # 5. Stamp successful run
    sb.mark_successful_run()
    log.info("=== fetch_ohlcv finished: %d fetches ===", fetched)
    return fetched


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        run()
        sys.exit(0)
    except Exception as e:
        log.exception("fetch_ohlcv failed: %s", e)
        sys.exit(1)
