# ============================================================
# src/indicators.py
# ============================================================
# Computes technical indicators from OHLCV bars stored in Redis
# and writes the results back to Redis.
#
# Entry point: python -m src.indicators
#
# Flow:
#   1. Exit if system_state.is_running = false
#   2. Load active sessions
#   3. For each (symbol, timeframe):
#         load bars from Redis
#         compute indicators
#         save indicators to Redis
#
# No pandas, no numpy. Pure Python lists and dicts.

import logging
import sys
from typing import Sequence

from . import supabase_client as sb
from . import redis_client as rds

# ------------------------------------------------------------
# Logging
# ------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("indicators")


# ============================================================
# PRIMITIVES
# ============================================================

def sma(values: Sequence[float], period: int) -> list[float | None]:
    """
    Simple moving average. Returns a list the same length as
    `values`, with None where the window is not yet full.
    """
    out: list[float | None] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return out

    window_sum = sum(values[:period])
    out[period - 1] = window_sum / period

    for i in range(period, len(values)):
        window_sum += values[i] - values[i - period]
        out[i] = window_sum / period

    return out


def ema(values: Sequence[float], period: int) -> list[float | None]:
    """
    Exponential moving average. Seeded with the SMA of the first
    `period` values, then smoothed.
    """
    out: list[float | None] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return out

    multiplier = 2.0 / (period + 1)

    seed = sum(values[:period]) / period
    out[period - 1] = seed

    prev = seed
    for i in range(period, len(values)):
        prev = (values[i] - prev) * multiplier + prev
        out[i] = prev

    return out


def stddev(values: Sequence[float], period: int) -> list[float | None]:
    """
    Rolling population standard deviation. None where window
    is not yet full.
    """
    out: list[float | None] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return out

    for i in range(period - 1, len(values)):
        window = values[i - period + 1 : i + 1]
        mean = sum(window) / period
        var = sum((x - mean) ** 2 for x in window) / period
        out[i] = var ** 0.5

    return out


# ============================================================
# INDICATORS
# ============================================================

def compute_sma(values: Sequence[float], period: int) -> dict:
    """Return the last SMA value plus a rising/falling flag."""
    series = sma(values, period)
    last = series[-1] if series else None
    prev = series[-2] if len(series) >= 2 else None

    rising = falling = False
    if last is not None and prev is not None:
        rising = last > prev
        falling = last < prev

    return {
        "value":   last,
        "prev":    prev,
        "rising":  rising,
        "falling": falling,
    }


def compute_ema(values: Sequence[float], period: int) -> dict:
    """Return the last EMA value plus a rising/falling flag."""
    series = ema(values, period)
    last = series[-1] if series else None
    prev = series[-2] if len(series) >= 2 else None

    rising = falling = False
    if last is not None and prev is not None:
        rising = last > prev
        falling = last < prev

    return {
        "value":   last,
        "prev":    prev,
        "rising":  rising,
        "falling": falling,
    }


def compute_rsi(closes: Sequence[float], period: int = 14) -> dict:
    """
    Wilder's RSI. Returns the latest value plus overbought and
    oversold flags.
    """
    if len(closes) < period + 1:
        return {"value": None, "overbought": False, "oversold": False}

    gains: list[float] = []
    losses: list[float] = []

    for i in range(1, len(closes)):
        delta = closes[i] - closes[i - 1]
        if delta >= 0:
            gains.append(delta)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(-delta)

    # First average: simple mean of first `period` gains/losses
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    # Wilder's smoothing for the rest
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        rsi = 100.0
    else:
        rs = avg_gain / avg_loss
        rsi = 100.0 - (100.0 / (1.0 + rs))

    return {
        "value":      rsi,
        "overbought": rsi >= 70,
        "oversold":   rsi <= 30,
    }


def compute_macd(
    closes: Sequence[float],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> dict:
    """
    MACD line, signal line, histogram, and cross detection.
    `cross` is True when MACD crosses signal on the last bar.
    """
    if len(closes) < slow + signal:
        return {
            "macd": None,
            "signal": None,
            "histogram": None,
            "cross_up": False,
            "cross_down": False,
        }

    ema_fast = ema(closes, fast)
    ema_slow = ema(closes, slow)

    macd_series: list[float | None] = []
    for f, s in zip(ema_fast, ema_slow):
        if f is None or s is None:
            macd_series.append(None)
        else:
            macd_series.append(f - s)

    # EMA of the non-None portion of the MACD series
    valid = [x for x in macd_series if x is not None]
    signal_series = ema(valid, signal)

    signal_tail = signal_series[-1] if signal_series else None
    signal_prev = signal_series[-2] if len(signal_series) >= 2 else None

    macd_tail = macd_series[-1]
    macd_prev = macd_series[-2] if len(macd_series) >= 2 else None

    histogram = None
    if macd_tail is not None and signal_tail is not None:
        histogram = macd_tail - signal_tail

    cross_up = cross_down = False
    if None not in (macd_tail, signal_tail, macd_prev, signal_prev):
        prev_diff = macd_prev - signal_prev
        curr_diff = macd_tail - signal_tail
        cross_up = prev_diff <= 0 < curr_diff
        cross_down = prev_diff >= 0 > curr_diff

    return {
        "macd":       macd_tail,
        "signal":     signal_tail,
        "histogram":  histogram,
        "cross_up":   cross_up,
        "cross_down": cross_down,
    }


def compute_bollinger(
    closes: Sequence[float],
    period: int = 20,
    mult: float = 2.0,
) -> dict:
    """Bollinger Bands: middle, upper, lower, width, and squeeze flag."""
    if len(closes) < period:
        return {
            "middle": None,
            "upper": None,
            "lower": None,
            "width": None,
            "squeeze": False,
        }

    mid_series = sma(closes, period)
    sd_series  = stddev(closes, period)

    mid = mid_series[-1]
    sd  = sd_series[-1]

    if mid is None or sd is None:
        return {
            "middle": None,
            "upper": None,
            "lower": None,
            "width": None,
            "squeeze": False,
        }

    upper = mid + mult * sd
    lower = mid - mult * sd
    width = (upper - lower) / mid if mid != 0 else None

    # Squeeze: width is in the bottom 25% of the last `period` widths
    recent_widths: list[float] = []
    for i in range(period - 1, len(closes)):
        m = mid_series[i]
        s = sd_series[i]
        if m and s is not None and m != 0:
            recent_widths.append(((m + mult * s) - (m - mult * s)) / m)

    squeeze = False
    if len(recent_widths) >= 4 and width is not None:
        recent_widths.sort()
        cutoff = recent_widths[max(0, len(recent_widths) // 4 - 1)]
        squeeze = width <= cutoff

    return {
        "middle":  mid,
        "upper":   upper,
        "lower":   lower,
        "width":   width,
        "squeeze": squeeze,
    }


def compute_atr(bars: Sequence[dict], period: int = 14) -> dict:
    """Average True Range using Wilder's smoothing."""
    if len(bars) < period + 1:
        return {"value": None, "percent": None, "expanding": False}

    trs: list[float] = []
    for i in range(1, len(bars)):
        h = bars[i]["high"]
        l = bars[i]["low"]
        prev_c = bars[i - 1]["close"]
        tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
        trs.append(tr)

    # Wilder's smoothing
    atr_val = sum(trs[:period]) / period
    for i in range(period, len(trs)):
        atr_val = (atr_val * (period - 1) + trs[i]) / period

    last_close = bars[-1]["close"]
    percent = (atr_val / last_close * 100.0) if last_close else None

    expanding = False
    if len(trs) >= period * 2:
        older_atr = sum(trs[:period]) / period
        if older_atr > 0:
            expanding = atr_val > older_atr * 1.2

    return {
        "value":     atr_val,
        "percent":   percent,
        "expanding": expanding,
    }


def compute_volume(bars: Sequence[dict], period: int = 20) -> dict:
    """Current volume vs rolling average, plus high/low flags."""
    if len(bars) < period + 1:
        return {"current": None, "average": None, "high": False, "low": False}

    vols = [b["volume"] for b in bars]
    avg_series = sma(vols, period)
    avg = avg_series[-1]
    current = vols[-1]

    if avg is None or avg == 0:
        return {"current": current, "average": avg, "high": False, "low": False}

    ratio = current / avg

    return {
        "current": current,
        "average": avg,
        "high":    ratio >= 1.5,
        "low":     ratio <= 0.6,
        "ratio":   ratio,
    }


# ============================================================
# TOP-LEVEL: compute all indicators for one (symbol, timeframe)
# ============================================================

def compute_all(bars: list[dict]) -> dict:
    """
    Given a list of bars (oldest → newest), return a dict of
    indicator snapshots keyed by indicator name.
    """
    if not bars or len(bars) < 30:
        return {}

    closes = [b["close"] for b in bars]

    return {
        "sma20":       compute_sma(closes, 20),
        "sma50":       compute_sma(closes, 50),
        "ema9":        compute_ema(closes, 9),
        "ema21":       compute_ema(closes, 21),
        "rsi14":       compute_rsi(closes, 14),
        "macd":        compute_macd(closes),
        "bollinger":   compute_bollinger(closes, 20, 2.0),
        "atr14":       compute_atr(bars, 14),
        "volume":      compute_volume(bars, 20),
    }


# ============================================================
# MAIN PIPELINE
# ============================================================

def run() -> int:
    """
    Execute one indicator computation cycle across every
    (symbol, timeframe) that has bars in Redis.
    Returns the number of (symbol, timeframe) pairs processed.
    """
    log.info("=== indicators starting ===")

    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped (system_state.is_running = false). Exiting.")
        return 0

    sessions = sb.get_active_sessions()
    if not sessions:
        log.info("No active sessions. Exiting.")
        return 0

    processed = 0

    for s in sessions:
        symbol = s.get("symbol")
        timeframes = s.get("timeframes") or []
        if not symbol or not timeframes:
            continue

        for tf in timeframes:
            bars = rds.load_bars(symbol, tf)
            if not bars:
                log.debug("No bars in Redis for %s %s — skipping", symbol, tf)
                continue

            indicators = compute_all(bars)
            if not indicators:
                log.warning("Insufficient bars for %s %s (%d bars)", symbol, tf, len(bars))
                continue

            rds.save_indicators(symbol, tf, indicators)
            log.info("  ✔ %s %s → %d indicators", symbol, tf, len(indicators))
            processed += 1

    log.info("=== indicators finished: %d pairs processed ===", processed)
    return processed


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        run()
        sys.exit(0)
    except Exception as e:
        log.exception("indicators failed: %s", e)
        sys.exit(1)
