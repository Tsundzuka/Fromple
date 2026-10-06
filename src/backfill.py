# ============================================================
# src/backfill.py
# ============================================================
# Sequential historical backfill for M5 bars.
#
# Design (v2 — flat-storage):
#   Each run fetches ONE window (5,000 bars) per symbol from
#   the symbol's current cursor. The window REPLACES the M5
#   list in Redis — it does not append. Storage stays flat at
#   ~5,000 bars per symbol for the entire backfill.
#
#   After fetching, the pipeline stages run inline on the
#   current window:
#     1. cleanup    — clears stale derived bars
#     2. aggregate  — derives M15–H8 from the new M5 window
#     3. indicators — computes snapshots for every bar
#     4. conditions — evaluates per-bar conditions
#     5. class_engine
#     6. signal_engine  — opens experiments with entry_at = bar dt
#     7. paper_trade    — closes them (they've long expired)
#
#   The class/signal guards are cleared before each window so
#   every bar in the fresh window gets processed.
#
#   Cursors advance after each run. When a cursor reaches
#   "now", the symbol is marked done and skipped thereafter.
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

# If a window's newest bar is within this many hours of "now",
# consider the symbol fully backfilled.
DONE_WINDOW_HOURS = 2

# Long TTL for cursor and done keys — must outlive the whole
# backfill campaign (weeks).
BACKFILL_KEY_TTL_SECONDS = 400 * 24 * 60 * 60  # 400 days

# Guards to clear before each window so the pipeline reprocesses
# every bar in the fresh window.
GUARD_SUFFIXES = ("last_class_bar", "last_processed_bar")


# ------------------------------------------------------------
# Key helpers
# ------------------------------------------------------------
def _cursor_key(symbol: str) -> str:
    return f"run:{symbol}:{BACKFILL_TIMEFRAME}:backfill_cursor"


def _done_key(symbol: str) -> str:
    return f"run:{symbol}:{BACKFILL_TIMEFRAME}:backfill_done"


def _guard_key(symbol: str, tf: str, suffix: str) -> str:
    return f"run:{symbol}:{tf}:{suffix}"


# ------------------------------------------------------------
# Datetime parsing
# ------------------------------------------------------------
def _parse_dt(value) -> datetime | None:
    if not value:
        return None
    s = str(value).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


# ------------------------------------------------------------
# Twelve Data calls
# ------------------------------------------------------------
def fetch_earliest_timestamp(provider_symbol: str) -> datetime | None:
    """Ask Twelve Data for the earliest available M5 bar."""
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
        log.warning("earliest_timestamp request failed for %s: %s",
                    provider_symbol, e)
        return None

    if isinstance(payload, dict) and payload.get("status") == "error":
        log.warning("earliest_timestamp error for %s: %s",
                    provider_symbol, payload.get("message"))
        return None

    raw = payload.get("datetime") if isinstance(payload, dict) else None
    return _parse_dt(raw)


def fetch_window(provider_symbol: str, start_dt: datetime) -> list[dict]:
    """Fetch up to WINDOW_SIZE M5 bars starting from start_dt."""
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
# Redis helpers
# ------------------------------------------------------------
def replace_m5(symbol: str, bars: list[dict]) -> int:
    """
    REPLACE the M5 bars key for this symbol with `bars`.
    Does not merge — the previous window is discarded.
    """
    key = rds.bars_key(symbol, BACKFILL_TIMEFRAME)
    rds.set_json(key, bars)
    return len(bars)


def clear_guards(symbol: str, timeframes: list[str]) -> None:
    """
    Clear the class and signal guards for every timeframe we're
    about to process, so the pipeline treats the fresh window
    as unprocessed.
    """
    for tf in timeframes:
        for suffix in GUARD_SUFFIXES:
            try:
                rds.delete(_guard_key(symbol, tf, suffix))
            except Exception as e:
                log.warning("Failed to clear %s: %s", suffix, e)


# ------------------------------------------------------------
# Pipeline orchestration (inline)
# ------------------------------------------------------------
def run_pipeline() -> None:
    """
    Run the pipeline stages in order against the current Redis
    state (which is the fresh backfill window). Stages are
    imported lazily to avoid circular imports.
    """
    from . import aggregate, indicators, conditions, \
                  class_engine, signal_engine, paper_trade, cleanup

    log.info("    pipeline: cleanup")
    cleanup.run()

    log.info("    pipeline: aggregate")
    aggregate.run()

    log.info("    pipeline: indicators")
    indicators.run()

    log.info("    pipeline: conditions")
    conditions.run()

    log.info("    pipeline: class_engine")
    class_engine.run()

    log.info("    pipeline: signal_engine")
    signal_engine.run()

    log.info("    pipeline: paper_trade")
    paper_trade.run()


# ------------------------------------------------------------
# Main
# ------------------------------------------------------------
def run() -> int:
    log.info("=== backfill starting (flat-storage mode) ===")

    config.require(
        "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
        "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
        "TWELVEDATA_API_KEY",
    )

    # --- Monkeypatch: treat the pipeline as running so the
    #     stages execute even if the system_state toggle is off.
    #     This override only applies to this process.
    _original_running = sb.is_pipeline_running
    sb.is_pipeline_running = lambda: True

    try:
        instruments = sb.get_active_instruments()
        sessions = sb.get_active_sessions()

        if not instruments or not sessions:
            log.warning("No instruments or sessions — exiting.")
            return 0

        # Unique symbols, and their timeframes for guard clearing.
        symbol_tfs: dict[str, list[str]] = {}
        for s in sessions:
            sym = s.get("symbol")
            tfs = s.get("timeframes") or []
            if sym:
                symbol_tfs.setdefault(sym, [])
                symbol_tfs[sym].extend(tfs)

        symbols = sorted(symbol_tfs.keys())
        now_utc = datetime.now(timezone.utc)
        done_cutoff = now_utc - timedelta(hours=DONE_WINDOW_HOURS)

        total_written = 0
        progressed = 0
        all_done = True
        any_window_written = False

        for symbol in symbols:
            if rds.get_json(_done_key(symbol)):
                log.debug("  %s: already done — skipping", symbol)
                continue

            all_done = False

            provider_symbol = instruments.get(symbol)
            if not provider_symbol:
                log.warning("  %s: no provider_symbol — skipping", symbol)
                continue

            # Determine start point
            cursor_raw = rds.get_json(_cursor_key(symbol))
            start_dt = _parse_dt(cursor_raw) if cursor_raw else None

            if start_dt is None:
                log.info("  %s: no cursor — querying earliest_timestamp", symbol)
                start_dt = fetch_earliest_timestamp(provider_symbol)
                sb.increment_api_usage(provider="twelvedata", by=1, limit_value=800)
                time.sleep(SECONDS_BETWEEN_CALLS)

                if start_dt is None:
                    log.warning("  %s: could not determine earliest "
                                "timestamp — skipping", symbol)
                    continue

                log.info("  %s: earliest M5 bar is %s", symbol, start_dt.date())

            # Fetch one window
            log.info("  %s: fetching window from %s", symbol, start_dt)
            bars = fetch_window(provider_symbol, start_dt)
            sb.increment_api_usage(provider="twelvedata", by=1, limit_value=800)

            if not bars:
                log.warning("  %s: empty window — marking done", symbol)
                rds.set_json(_done_key(symbol), True,
                             ttl_seconds=BACKFILL_KEY_TTL_SECONDS)
                time.sleep(SECONDS_BETWEEN_CALLS)
                continue

            # Replace M5 (do not merge — flat storage)
            total = replace_m5(symbol, bars)
            total_written += len(bars)
            progressed += 1
            any_window_written = True

            newest_dt = _parse_dt(bars[-1].get("datetime"))

            # Advance cursor
            if newest_dt:
                rds.set_json(
                    _cursor_key(symbol),
                    newest_dt.strftime("%Y-%m-%d %H:%M:%S"),
                    ttl_seconds=BACKFILL_KEY_TTL_SECONDS,
                )

            log.info("  %s: %d bars (cursor → %s)",
                     symbol, len(bars), newest_dt)

            # Clear guards so the pipeline reprocesses this window
            clear_guards(symbol, symbol_tfs.get(symbol, []))

            # Done detection
            reached_present = (
                len(bars) < WINDOW_SIZE
                or (newest_dt is not None and newest_dt >= done_cutoff)
            )
            if reached_present:
                log.info("  %s: reached present — marking done", symbol)
                rds.set_json(_done_key(symbol), True,
                             ttl_seconds=BACKFILL_KEY_TTL_SECONDS)

            time.sleep(SECONDS_BETWEEN_CALLS)

        # Run the pipeline on the window we just fetched
        if any_window_written:
            log.info("=== running pipeline on fresh backfill window ===")
            run_pipeline()
            log.info("=== pipeline done ===")
        else:
            log.info("No new windows fetched — skipping pipeline run")

        if all_done:
            log.info("All symbols backfilled — nothing to do.")

        log.info("=== backfill finished: %d symbols, %d bars written ===",
                 progressed, total_written)
        return total_written

    finally:
        # Restore the original function (defensive — process is
        # about to exit anyway)
        sb.is_pipeline_running = _original_running


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
