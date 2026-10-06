# ============================================================
# src/fetch_ohlcv.py
# ============================================================
# Fetches OHLCV bars for the BASE timeframes directly from
# Twelve Data, and skips the DERIVED timeframes — those are
# produced by aggregate.py from the M5 bars.
#
# BASE timeframes (fetched here):
#   M5   — 5-minute base, also drives all aggregation
#   H12  — updates twice a day
#   D1   — updates once a day
#   W1   — updates once a week
#   MN1  — updates once a month
#
# DERIVED timeframes (skip here, produced by aggregate.py):
#   M15, M30, H1, H2, H4, H6, H8
#
# All bars are persisted across cycles:
#   - New bars are merged with existing bars in Redis
#   - Duplicates are removed (by datetime)
#   - Each list is capped at its per-timeframe MAX_BARS
#   - A TTL is set on each key as a safety net
#
# Entry point: python -m src.fetch_ohlcv

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
# Timeframe policy
# ------------------------------------------------------------
# Timeframes fetched from Twelve Data in this script.
BASE_TIMEFRAMES = ("M5", "H12", "D1", "W1", "MN1")

# Timeframes derived by aggregate.py. Listed here so this script
# can skip them explicitly.
DERIVED_TIMEFRAMES = {"M15", "M30", "H1", "H2", "H4", "H6", "H8"}

# Twelve Data requests are spaced out to stay under 8/min on free tier.
SECONDS_BETWEEN_CALLS = 8

# Per-timeframe caps and TTLs (in seconds).
#
# Caps are chosen to give each timeframe at least 20× SMA50 headroom
# while keeping Redis usage tiny:
#   M5   : 5,000 bars ≈ 17 days        (~1.25 MB)
#   H12  : 1,000 bars ≈ 500 days       (~0.25 MB)
#   D1   : 1,000 bars ≈ 4 years        (~0.25 MB)
#   W1   :   500 bars ≈ 10 years       (~0.13 MB)
#   MN1  :   200 bars ≈ 16 years       (~0.05 MB)
# Per symbol: ~1.9 MB. Across 4 symbols: ~7.6 MB.
MAX_BARS = {
    "M5":  5_000,
    "H12": 1_000,
    "D1":  1_000,
    "W1":    500,
    "MN1":   200,
}

TTL_SECONDS = {
    "M5":  365 * 24 * 60 * 60,          # 365 days
    "H12": 730 * 24 * 60 * 60,          # 730 days
    "D1":  5 * 365 * 24 * 60 * 60,      # 5 years
    "W1":  10 * 365 * 24 * 60 * 60,     # 10 years
    "MN1": 10 * 365 * 24 * 60 * 60,     # 10 years
}


# ============================================================
# FETCH GUARD (per timeframe)
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

    last_dt = _parse_bar_datetime(
        last_raw if isinstance(last_raw, str) else str(last_raw)
    )
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
# PERSISTENCE — merge, dedupe, trim, save
# ============================================================
def merge_bars(existing: list[dict], new: list[dict], cap: int) -> list[dict]:
    """
    Merge two bar lists, dedupe by `datetime`, sort ascending,
    and trim to the last `cap` entries.
    """
    by_dt: dict[str, dict] = {b["datetime"]: b for b in existing if "datetime" in b}
    for b in new:
        if "datetime" in b:
            by_dt[b["datetime"]] = b  # newer wins on collision

    merged = sorted(by_dt.values(), key=lambda b: b["datetime"])
    if len(merged) > cap:
        merged = merged[-cap:]
    return merged


def persist_bars(symbol: str, timeframe: str, new_bars: list[dict]) -> int:
    """
    Read existing bars for (symbol, timeframe), merge with new bars,
    and write back. Returns the total number of bars after merge.
    """
    key = rds.bars_key(symbol, timeframe)
    existing = rds.get_json(key) or []
    if not isinstance(existing, list):
        existing = []

    cap = MAX_BARS.get(timeframe, 5_000)
    ttl = TTL_SECONDS.get(timeframe, 365 * 24 * 60 * 60)

    merged = merge_bars(existing, new_bars, cap)
    rds.set_json(key, merged, ttl_seconds=ttl)
    return len(merged)


# ============================================================
# MAIN PIPELINE
# ============================================================
def run() -> int:
    log.info("=== fetch_ohlcv starting ===")
    log.info("Base timeframes: %s", ", ".join(BASE_TIMEFRAMES))
    log.info("Derived (skipped): %s", ", ".join(sorted(DERIVED_TIMEFRAMES)))

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

    # Verify all base timeframes exist in the registry
    missing_base = [tf for tf in BASE_TIMEFRAMES if tf not in timeframes]
    if missing_base:
        log.warning("Base timeframes not in registry: %s", ", ".join(missing_base))

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

    # 4. Fetch each base timeframe for each in-window symbol
    fetched = 0
    skipped = 0
    errors = 0

    for s in due_sessions:
        symbol = s.get("symbol")
        tf_codes = s.get("timeframes") or []
        if not symbol or not tf_codes:
            continue

        provider_symbol = instruments.get(symbol)
        if not provider_symbol:
            log.warning("No provider_symbol registered for %s — skipping", symbol)
            continue

        for tf in tf_codes:
            # Skip derived timeframes — aggregate.py produces them
            if tf in DERIVED_TIMEFRAMES:
                continue

            # Only process base timeframes
            if tf not in BASE_TIMEFRAMES:
                continue

            tf_meta = timeframes.get(tf)
            if not tf_meta:
                log.warning("Unknown timeframe '%s' for %s — skipping", tf, symbol)
                continue

            provider_interval = tf_meta["provider_interval"]
            duration_minutes  = tf_meta["duration_minutes"]

            # Fetch guard
            if not is_fetch_due(symbol, tf, duration_minutes, now_utc):
                log.debug("Not due yet: %s %s — skipping", symbol, tf)
                skipped += 1
                continue

            log.info("Fetching %s (%s) %s (%s)…",
                     symbol, provider_symbol, tf, provider_interval)

            bars = fetch_bars(provider_symbol, provider_interval, config.BARS_PER_FETCH)

            if bars:
                total = persist_bars(symbol, tf, bars)
                stamp_last_bar(symbol, tf, bars)
                log.info("  ✔ %s %s: merged %d new → %d total",
                         symbol, tf, len(bars), total)
                fetched += 1
            else:
                log.warning("  ✘ No bars written for %s %s", symbol, tf)
                errors += 1

            sb.increment_api_usage(provider="twelvedata", by=1, limit_value=800)
            time.sleep(SECONDS_BETWEEN_CALLS)

    sb.mark_successful_run()
    log.info("=== fetch_ohlcv finished: %d fetched, %d skipped, %d errors ===",
             fetched, skipped, errors)
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
