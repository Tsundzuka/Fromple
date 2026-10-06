# ============================================================
# src/indicators.py
# ============================================================
# Computes technical indicators from OHLCV bars stored in Redis
# and writes a per-bar snapshot history back to Redis.
#
# BATCH MODE: produces one indicator snapshot per bar, aligned
# with the bars array via the `_bar_dt` field.
#
# Entry point: python -m src.indicators
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


# Minimum bars required to produce a snapshot. Must be at least
# the longest-period indicator + its lookback (SMA50 = 50).
MIN_BARS_FOR_SNAPSHOT = 50


# ============================================================
# PRIMITIVES
# ============================================================
def sma(values: Sequence[float], period: int) -> list[float | None]:
    """Simple moving average. Returns list the same length as values."""
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
    """Exponential moving average, seeded with SMA."""
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
    """Rolling population standard deviation."""
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
# SERIES COMPUTATIONS
# ============================================================
def rsi_series(closes: Sequence[float], period: int = 14) -> list[float | None]:
    """Wilder's RSI as a full series."""
    n = len(closes)
    out: list[float | None] = [None] * n
    if n < period + 1:
        return out

    gains = [0.0] * n
    losses = [0.0] * n
    for i in range(1, n):
        delta = closes[i] - closes[i - 1]
        if delta >= 0:
            gains[i] = delta
        else:
            losses[i] = -delta

    avg_gain = sum(gains[1 : period + 1]) / period
    avg_loss = sum(losses[1 : period + 1]) / period

    if avg_loss == 0:
        out[period] = 100.0
    else:
        rs = avg_gain / avg_loss
        out[period] = 100.0 - (100.0 / (1.0 + rs))

    for i in range(period + 1, n):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            out[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            out[i] = 100.0 - (100.0 / (1.0 + rs))

    return out


def macd_series(
    closes: Sequence[float],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> dict:
    """MACD line, signal, histogram, cross flags — aligned to closes."""
    n = len(closes)
    macd_line: list[float | None] = [None] * n
    signal_line: list[float | None] = [None] * n
    histogram: list[float | None] = [None] * n
    cross_up: list[bool] = [False] * n
    cross_down: list[bool] = [False] * n

    if n < slow + signal:
        return {
            "macd": macd_line,
            "signal": signal_line,
            "histogram": histogram,
            "cross_up": cross_up,
            "cross_down": cross_down,
        }

    ema_fast = ema(closes, fast)
    ema_slow = ema(closes, slow)

    for i in range(n):
        if ema_fast[i] is not None and ema_slow[i] is not None:
            macd_line[i] = ema_fast[i] - ema_slow[i]

    macd_start = slow - 1
    macd_valid = macd_line[macd_start:]
    sig_valid = ema(macd_valid, signal)

    for i, sv in enumerate(sig_valid):
        if sv is not None:
            signal_line[macd_start + i] = sv

    for i in range(n):
        if macd_line[i] is not None and signal_line[i] is not None:
            histogram[i] = macd_line[i] - signal_line[i]

    for i in range(1, n):
        if None not in (
            macd_line[i], signal_line[i],
            macd_line[i - 1], signal_line[i - 1],
        ):
            prev_diff = macd_line[i - 1] - signal_line[i - 1]
            curr_diff = macd_line[i] - signal_line[i]
            cross_up[i] = prev_diff <= 0 < curr_diff
            cross_down[i] = prev_diff >= 0 > curr_diff

    return {
        "macd": macd_line,
        "signal": signal_line,
        "histogram": histogram,
        "cross_up": cross_up,
        "cross_down": cross_down,
    }


def bollinger_series(
    closes: Sequence[float],
    period: int = 20,
    mult: float = 2.0,
) -> dict:
    """Bollinger bands + width + per-bar squeeze flag."""
    n = len(closes)
    mid = sma(closes, period)
    sd = stddev(closes, period)

    upper: list[float | None] = [None] * n
    lower: list[float | None] = [None] * n
    width: list[float | None] = [None] * n
    squeeze: list[bool] = [False] * n

    for i in range(n):
        if mid[i] is not None and sd[i] is not None and mid[i] != 0:
            upper[i] = mid[i] + mult * sd[i]
            lower[i] = mid[i] - mult * sd[i]
            width[i] = (upper[i] - lower[i]) / mid[i]

    for i in range(n):
        if width[i] is None:
            continue
        recent = [w for w in width[max(0, i - period + 1) : i + 1] if w is not None]
        if len(recent) >= 4:
            sorted_recent = sorted(recent)
            cutoff = sorted_recent[max(0, len(sorted_recent) // 4 - 1)]
            squeeze[i] = width[i] <= cutoff

    return {
        "middle": mid,
        "upper": upper,
        "lower": lower,
        "width": width,
        "squeeze": squeeze,
    }


def atr_series(
    bars: Sequence[dict],
    period: int = 14,
) -> dict:
    """ATR (Wilder's smoothing) + percent + expanding flag."""
    n = len(bars)
    atr: list[float | None] = [None] * n
    percent: list[float | None] = [None] * n
    expanding: list[bool] = [False] * n

    if n < period + 1:
        return {"value": atr, "percent": percent, "expanding": expanding}

    trs = [0.0] * n
    for i in range(1, n):
        h = bars[i]["high"]
        l = bars[i]["low"]
        prev_c = bars[i - 1]["close"]
        trs[i] = max(h - l, abs(h - prev_c), abs(l - prev_c))

    atr[period] = sum(trs[1 : period + 1]) / period

    for i in range(period + 1, n):
        atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period

    for i in range(n):
        if atr[i] is not None and bars[i]["close"]:
            percent[i] = atr[i] / bars[i]["close"] * 100.0

    for i in range(period * 2, n):
        if atr[i] is not None and atr[i - period] is not None and atr[i - period] > 0:
            expanding[i] = atr[i] > atr[i - period] * 1.2

    return {"value": atr, "percent": percent, "expanding": expanding}


def volume_series(bars: Sequence[dict], period: int = 20) -> dict:
    """Volume vs rolling average + high/low flags."""
    n = len(bars)
    vols = [b["volume"] for b in bars]
    avg = sma(vols, period)

    current: list[float | None] = list(vols)
    high: list[bool] = [False] * n
    low: list[bool] = [False] * n
    ratio: list[float | None] = [None] * n

    for i in range(n):
        if avg[i] is not None and avg[i] > 0:
            r = current[i] / avg[i]
            ratio[i] = r
            high[i] = r >= 1.5
            low[i] = r <= 0.6

    return {
        "current": current,
        "average": avg,
        "high": high,
        "low": low,
        "ratio": ratio,
    }


# ============================================================
# SNAPSHOT BUILDER
# ============================================================
def _safe(v):
    """Coerce NaN/Inf to None so JSON serialisation never fails."""
    if isinstance(v, float):
        if v != v or v in (float("inf"), float("-inf")):
            return None
    return v


def build_snapshots(bars: list[dict]) -> list[dict]:
    """
    Given bars oldest → newest, return one indicator snapshot per
    bar. Bars before MIN_BARS_FOR_SNAPSHOT are skipped (indicators
    aren't meaningful yet).

    Each snapshot carries `_bar_dt` (the bar's datetime) so
    downstream stages can match snapshots to bars directly.
    """
    n = len(bars)
    if n < MIN_BARS_FOR_SNAPSHOT:
        return []

    closes = [b["close"] for b in bars]

    sma20_s   = sma(closes, 20)
    sma50_s   = sma(closes, 50)
    ema9_s    = ema(closes, 9)
    ema21_s   = ema(closes, 21)
    rsi_s     = rsi_series(closes, 14)
    macd_s    = macd_series(closes)
    bb_s      = bollinger_series(closes, 20, 2.0)
    atr_s     = atr_series(bars, 14)
    vol_s     = volume_series(bars, 20)

    snapshots: list[dict] = []

    for i in range(MIN_BARS_FOR_SNAPSHOT - 1, n):
        s20, s20p = sma20_s[i], sma20_s[i - 1] if i >= 1 else None
        s50, s50p = sma50_s[i], sma50_s[i - 1] if i >= 1 else None
        e9, e9p   = ema9_s[i],  ema9_s[i - 1] if i >= 1 else None
        e21, e21p = ema21_s[i], ema21_s[i - 1] if i >= 1 else None

        snap = {
            "_bar_dt": bars[i].get("datetime"),
            "sma20": {
                "value":   _safe(s20),
                "prev":    _safe(s20p),
                "rising":  s20 is not None and s20p is not None and s20 > s20p,
                "falling": s20 is not None and s20p is not None and s20 < s20p,
            },
            "sma50": {
                "value":   _safe(s50),
                "prev":    _safe(s50p),
                "rising":  s50 is not None and s50p is not None and s50 > s50p,
                "falling": s50 is not None and s50p is not None and s50 < s50p,
            },
            "ema9": {
                "value":   _safe(e9),
                "prev":    _safe(e9p),
                "rising":  e9 is not None and e9p is not None and e9 > e9p,
                "falling": e9 is not None and e9p is not None and e9 < e9p,
            },
            "ema21": {
                "value":   _safe(e21),
                "prev":    _safe(e21p),
                "rising":  e21 is not None and e21p is not None and e21 > e21p,
                "falling": e21 is not None and e21p is not None and e21 < e21p,
            },
            "rsi14": {
                "value":      _safe(rsi_s[i]),
                "overbought": rsi_s[i] is not None and rsi_s[i] >= 70,
                "oversold":   rsi_s[i] is not None and rsi_s[i] <= 30,
            },
            "macd": {
                "macd":       _safe(macd_s["macd"][i]),
                "signal":     _safe(macd_s["signal"][i]),
                "histogram":  _safe(macd_s["histogram"][i]),
                "cross_up":   bool(macd_s["cross_up"][i]),
                "cross_down": bool(macd_s["cross_down"][i]),
            },
            "bollinger": {
                "middle":  _safe(bb_s["middle"][i]),
                "upper":   _safe(bb_s["upper"][i]),
                "lower":   _safe(bb_s["lower"][i]),
                "width":   _safe(bb_s["width"][i]),
                "squeeze": bool(bb_s["squeeze"][i]),
            },
            "atr14": {
                "value":     _safe(atr_s["value"][i]),
                "percent":   _safe(atr_s["percent"][i]),
                "expanding": bool(atr_s["expanding"][i]),
            },
            "volume": {
                "current": _safe(vol_s["current"][i]),
                "average": _safe(vol_s["average"][i]),
                "high":    bool(vol_s["high"][i]),
                "low":     bool(vol_s["low"][i]),
                "ratio":   _safe(vol_s["ratio"][i]),
            },
        }
        snapshots.append(snap)

    return snapshots


# ============================================================
# MAIN PIPELINE
# ============================================================
def run() -> int:
    log.info("=== indicators starting (batch mode) ===")

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

            snapshots = build_snapshots(bars)
            if not snapshots:
                log.warning("Insufficient bars for %s %s (%d bars)",
                            symbol, tf, len(bars))
                continue

            rds.save_indicators(symbol, tf, snapshots)
            log.info("  ✔ %s %s → %d snapshots from %d bars",
                     symbol, tf, len(snapshots), len(bars))
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
