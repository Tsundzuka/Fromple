# ============================================================
# src/fetch_ohlcv.py
# ============================================================
# Fetches M5 OHLCV bars from Twelve Data for every instrument
# whose session window currently contains the UTC time, and
# writes them to Upstash Redis.
#
# Only M5 is fetched. All higher timeframes (M15, M30, H1, H2,
# H4, H6, H8, H12, D1, W1) are derived from M5 by aggregate.py,
# which runs as a separate step in the pipeline.
#
# M5 bars are persisted across cycles:
#   - New bars are merged with existing bars in Redis
#   - Duplicates are removed (by datetime)
#   - The list is capped at MAX_M5_BARS (~1 year of M5)
#   - A 365-day TTL is set on the key as a safety net
#
# Entry point: python -m src.fetch_ohlcv
#
# Dynamic configuration (no hardcoded symbols or timeframes):
#   - instruments table  → symbol → provider_symbol
#   - timeframes table   → code → provider_interval + duration_minutes
#   - sessions table     → user-controlled enabled instruments + timeframes

import logging
import sys
import time
from datetime import datetime, time as dtime, timedelta, timezone
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
# Constants
# ------------------------------------------------------------
# Twelve Data only needs to be hit for the base timeframe.
FETCH_TIMEFRAME = "M5"

# Twelve Data requests are spaced out to stay under 8/min on free tier.
SECONDS_BETWEEN_CALLS = 8

# Cap on how many M5 bars to keep per symbol in Redis.
# 100,000 bars of M5 ≈ 347 days ≈ 1 year.
# Storage estimate: ~25 MB per symbol, ~100 MB for 4 symbols.
# Fits within Upstash free tier (256 MB).
MAX_M5_BARS = 100_000

# M5 key lifetime in Redis — 365 days.
M5_TTL_SECONDS = 365 * 24 * 60 * 60


# ============================================================
# FETCH GUARD (per timeframe — still M5 only)
# ============================================================
def _last_bar_key(symbol: str, timeframe: str) -> str:
    return f"run:{symbol}:{timeframe}:last_bar_dt"


def _parse_bar_datetime(value: str) -> datetime | None:
    if not value:
        return None
    s = str(value).strip()

    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    return None


def is_fetch_due(symbol: str, timeframe: str, duration_minutes: int, now_utc: datetime) -> bool:
    """
    Return True if the next bar boundary has passed since the
    last recorded bar. First fetch of the day always returns True.
    """
    if duration_minutes <= 0:
        return False

    last_raw = rds.get_json(_last_bar_key(symbol, timeframe))
    if not last_raw:
        return True

    last_dt = _parse_bar_datetime(last_raw if isinstance(last_raw, str) else str(last_raw))
    if last_dt is None:
        return True

    next_boundary = last_dt + timedelta(minutes=duration_minutes)
    return now_utc >= next_boundary


def stamp_last_bar(symbol: str, timeframe: str, bars: list[dict]) -> None:
    if not bars:
        return
    newest = bars[-1].get("datetime")
    if newest:
        rds.set_json(_last_bar_key(symbol, timeframe), str(newest))


# ============================================================
# SESSION WINDOW CHECK
# ============================================================
def _parse_time(value: Any) -> dtime | None:
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
    if start is None or end is None:
        return False
    t = now_utc.timetz()
    if start <= end:
        return start <= t <= end
    return t >= start or t <= end


# ============================================================
# TWELVE DATA FETCH
# ============================================================
def fetch_bars(
    provider_symbol: str,
    provider_interval: str,
    outputsize: int,
) -> list[dict]:
    """
    Fetch OHLCV bars from Twelve Data. Returns a list of dicts
    sorted oldest → newest. Returns [] on failure.
    """
    url = f"{config.TWELVEDATA_BASE_URL}/time_series"
    params = {
        "symbol":     provider_symbol,
        "interval":   provider_interval,
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
            log.warning("Twelve Data request failed (%s attempt %d): %s",
                        provider_symbol, attempt, e)
            if attempt == 1:
                time.sleep(3)
                continue
            return []

        if isinstance(payload, dict) and payload.get("status") == "error":
            log.warning("Twelve Data error for %s: %s",
                        provider_symbol, payload.get("message"))
            if attempt == 1:
                time.sleep(10)
                continue
            return []

        values = payload.get("values") if isinstance(payload, dict) else None
        if not values:
            log.warning("Twelve Data returned no bars for %s", provider_symbol)
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
                log.warning("Skipping malformed bar for %s: %s", provider_symbol, e)

        return bars

    return []


# ============================================================
# M5 PERSISTENCE — merge, dedupe, trim, save
# ============================================================
def merge_bars(existing: list[dict], new: list[dict]) -> list[dict]:
    """
    Merge two bar lists, dedupe by `datetime`, sort ascending,
    and trim to the last MAX_M5_BARS entries.
    """
    by_dt: dict[str, dict] = {b["datetime"]: b for b in existing if "datetime" in b}
    for b in new:
        if "datetime" in b:
            by_dt[b["datetime"]] = b  # newer wins on collision

    merged = sorted(by_dt.values(), key=lambda b: b["datetime"])
    if len(merged) > MAX_M5_BARS:
        merged = merged[-MAX_M5_BARS:]
    return merged


def persist_m5(symbol: str, new_bars: list[dict]) -> int:
    """
    Read existing M5 bars from Redis, merge with new bars, and
    write back. Returns the total number of bars after merge.
    """
    key = rds.bars_key(symbol, FETCH_TIMEFRAME)
    existing = rds.get_json(key) or []
    if not isinstance(existing, list):
        existing = []

    merged = merge_bars(existing, new_bars)
    rds.set_json(key, merged, ttl_seconds=M5_TTL_SECONDS)
    return len(merged)


# ============================================================
# MAIN PIPELINE
# ============================================================
def run() -> int:
    log.info("=== fetch_ohlcv starting (M5 only) ===")

    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped (system_state.is_running = false). Exiting.")
        return 0

    # 1. Load dynamic registries
    instruments = sb.get_active_instruments()
    timeframes  = sb.get_timeframe_map()

    if not instruments:
        log.warning("No active instruments found. Exiting.")
        return 0
    if not timeframes:
        log.warning("No active timeframes found. Exiting.")
        return 0

    m5_meta = timeframes.get(FETCH_TIMEFRAME)
    if not m5_meta:
        log.error("Timeframe '%s' missing from registry. Exiting.", FETCH_TIMEFRAME)
        return 0

    log.info("Registries: %d instruments, %d timeframes",
             len(instruments), len(timeframes))

    # 2. Load sessions
    sessions = sb.get_active_sessions()
    if not sessions:
        log.info("No active sessions. Exiting.")
        return 0

    now_utc = datetime.now(timezone.utc)
    log.info("Current UTC time: %s", now_utc.strftime("%Y-%m-%d %H:%M:%S"))

    # 3. Filter to in-window sessions
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

    log.info("In-window instruments: %s",
             ", ".join(s.get("symbol", "?") for s in due_sessions))

    fetched = 0
    skipped = 0

    for s in due_sessions:
        symbol = s.get("symbol")
        if not symbol:
            continue

        provider_symbol = instruments.get(symbol)
        if not provider_symbol:
            log.warning("No provider_symbol registered for %s — skipping", symbol)
            continue

        # Fetch guard for M5
        if not is_fetch_due(symbol, FETCH_TIMEFRAME, m5_meta["duration_minutes"], now_utc):
            log.debug("Not due yet: %s %s — skipping", symbol, FETCH_TIMEFRAME)
            skipped += 1
            continue

        log.info("Fetching %s (%s) %s (%s, %d bars)…",
                 symbol, provider_symbol, FETCH_TIMEFRAME,
                 m5_meta["provider_interval"], config.BARS_PER_FETCH)

        bars = fetch_bars(
            provider_symbol,
            m5_meta["provider_interval"],
            config.BARS_PER_FETCH,
        )

        if bars:
            total = persist_m5(symbol, bars)
            stamp_last_bar(symbol, FETCH_TIMEFRAME, bars)
            log.info("  ✔ Merged %d new → %d total M5 bars for %s",
                     len(bars), total, symbol)
            fetched += 1
        else:
            log.warning("  ✘ No bars written for %s %s", symbol, FETCH_TIMEFRAME)

        sb.increment_api_usage(provider="twelvedata", by=1, limit_value=800)
        time.sleep(SECONDS_BETWEEN_CALLS)

    sb.mark_successful_run()
    log.info("=== fetch_ohlcv finished: %d fetched, %d skipped (not due) ===",
             fetched, skipped)
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
