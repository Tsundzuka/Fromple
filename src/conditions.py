# ============================================================
# src/conditions.py
# ============================================================
# Evaluates market conditions from bars + indicators stored in
# Redis, and writes a condition dictionary back to Redis.
#
# Entry point: python -m src.conditions
#
# Produces two things per (symbol, timeframe):
#   1. Regime:        "uptrend" | "downtrend" | "consolidating"
#   2. Conditions:    dict of {"regime.uptrend": True, ...}
#
# Everything here is deterministic and pure. No external calls.

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
log = logging.getLogger("conditions")


# ============================================================
# REGIME
# ============================================================

def classify_regime(bars: list[dict], indicators: dict) -> str:
    """
    Uptrend / Downtrend / Consolidating.

    Uses SMA20 + SMA50 alignment, MACD direction, and the ATR
    expansion flag. Deterministic and conservative: only
    declares a trend when at least two signals agree.
    """
    sma20 = indicators.get("sma20", {})
    sma50 = indicators.get("sma50", {})
    macd  = indicators.get("macd", {})

    v20 = sma20.get("value")
    v50 = sma50.get("value")
    r20 = sma20.get("rising")
    f20 = sma20.get("falling")

    macd_hist = macd.get("histogram")

    up_votes = 0
    down_votes = 0

    # SMA20 vs SMA50
    if v20 is not None and v50 is not None:
        if v20 > v50:
            up_votes += 1
        elif v20 < v50:
            down_votes += 1

    # SMA20 slope
    if r20:
        up_votes += 1
    if f20:
        down_votes += 1

    # MACD histogram
    if macd_hist is not None:
        if macd_hist > 0:
            up_votes += 1
        elif macd_hist < 0:
            down_votes += 1

    if up_votes >= 2 and down_votes == 0:
        return "uptrend"
    if down_votes >= 2 and up_votes == 0:
        return "downtrend"
    return "consolidating"


# ============================================================
# MARKET STATE
# ============================================================

def find_swing_levels(bars: list[dict], lookback: int = 50) -> dict:
    """
    Identify recent swing highs and lows over the last `lookback`
    bars. Returns the highest high, lowest low, and their bar
    indices relative to the slice.
    """
    window = bars[-lookback:] if len(bars) >= lookback else bars
    if not window:
        return {"high": None, "low": None, "high_idx": None, "low_idx": None}

    high = window[0]["high"]
    low  = window[0]["low"]
    high_idx = 0
    low_idx = 0

    for i, b in enumerate(window):
        if b["high"] > high:
            high = b["high"]
            high_idx = i
        if b["low"] < low:
            low = b["low"]
            low_idx = i

    return {"high": high, "low": low, "high_idx": high_idx, "low_idx": low_idx}


def evaluate_market_state(
    bars: list[dict],
    indicators: dict,
    lookback: int = 50,
    proximity_pct: float = 0.0015,
) -> dict:
    """
    Evaluate market state as a dict of flags. `proximity_pct` is
    how close price must be to a level to count as "at" it
    (0.15% by default, reasonable for FX).
    """
    if len(bars) < 20:
        return {}

    last = bars[-1]
    close = last["close"]
    high  = last["high"]
    low   = last["low"]
    open_ = last["open"]

    levels = find_swing_levels(bars, lookback)
    swing_high = levels["high"]
    swing_low  = levels["low"]

    at_support = False
    at_resistance = False

    if swing_low is not None and close > 0:
        dist = abs(close - swing_low) / close
        if dist <= proximity_pct:
            at_support = True

    if swing_high is not None and close > 0:
        dist = abs(close - swing_high) / close
        if dist <= proximity_pct:
            at_resistance = True

    # Range position: where is close within the swing range?
    range_position = None
    if swing_high is not None and swing_low is not None and swing_high > swing_low:
        pct = (close - swing_low) / (swing_high - swing_low)
        if pct >= 0.66:
            range_position = "upper"
        elif pct <= 0.34:
            range_position = "lower"
        else:
            range_position = "mid"

    # Wick behaviour: long wick rejection on the last bar
    body = abs(close - open_)
    total_range = high - low
    wick_rejection = False
    if total_range > 0 and body < total_range * 0.35:
        upper_wick = high - max(close, open_)
        lower_wick = min(close, open_) - low
        if upper_wick > body * 1.5 or lower_wick > body * 1.5:
            wick_rejection = True

    vol = indicators.get("volume", {})
    atr = indicators.get("atr14", {})

    return {
        "at_support":     at_support,
        "at_resistance":  at_resistance,
        "range_position": range_position,
        "wick_rejection": wick_rejection,
        "volume_high":    bool(vol.get("high")),
        "volume_low":     bool(vol.get("low")),
        "volatility_expanding": bool(atr.get("expanding")),
        "close":          close,
        "swing_high":     swing_high,
        "swing_low":      swing_low,
    }


# ============================================================
# INDICATOR CONDITIONS
# ============================================================

def evaluate_indicator_conditions(indicators: dict) -> dict:
    """Turn indicator snapshots into boolean condition flags."""
    out: dict = {}

    sma20 = indicators.get("sma20", {})
    sma50 = indicators.get("sma50", {})
    rsi   = indicators.get("rsi14", {})
    macd  = indicators.get("macd", {})
    bb    = indicators.get("bollinger", {})

    out["ind.sma20_rising"]   = bool(sma20.get("rising"))
    out["ind.sma20_falling"]  = bool(sma20.get("falling"))
    out["ind.sma50_rising"]   = bool(sma50.get("rising"))
    out["ind.sma50_falling"]  = bool(sma50.get("falling"))

    out["ind.rsi_overbought"] = bool(rsi.get("overbought"))
    out["ind.rsi_oversold"]   = bool(rsi.get("oversold"))
    rsi_val = rsi.get("value")
    out["ind.rsi_above_55"]   = rsi_val is not None and rsi_val > 55
    out["ind.rsi_below_45"]   = rsi_val is not None and rsi_val < 45

    out["ind.macd_cross_up"]   = bool(macd.get("cross_up"))
    out["ind.macd_cross_down"] = bool(macd.get("cross_down"))
    hist = macd.get("histogram")
    out["ind.macd_bullish"] = hist is not None and hist > 0
    out["ind.macd_bearish"] = hist is not None and hist < 0

    out["ind.bollinger_squeeze"] = bool(bb.get("squeeze"))

    return out


# ============================================================
# BUILD THE FULL CONDITION DICTIONARY
# ============================================================

def build_conditions(
    symbol: str,
    timeframe: str,
    bars: list[dict],
    indicators: dict,
) -> dict:
    """
    Combine regime + market state + indicator flags into a flat
    condition dictionary. Every key is a stable string; every
    value is a bool.
    """
    if not bars or not indicators:
        return {}

    regime = classify_regime(bars, indicators)
    state  = evaluate_market_state(bars, indicators)
    inds   = evaluate_indicator_conditions(indicators)

    conditions: dict = {
        "regime.uptrend":       regime == "uptrend",
        "regime.downtrend":     regime == "downtrend",
        "regime.consolidating": regime == "consolidating",

        "state.at_support":              bool(state.get("at_support")),
        "state.at_resistance":           bool(state.get("at_resistance")),
        "state.range_upper":             state.get("range_position") == "upper",
        "state.range_lower":             state.get("range_position") == "lower",
        "state.range_mid":               state.get("range_position") == "mid",
        "state.wick_rejection":          bool(state.get("wick_rejection")),
        "state.volume_high":             bool(state.get("volume_high")),
        "state.volume_low":              bool(state.get("volume_low")),
        "state.volatility_expanding":    bool(state.get("volatility_expanding")),
    }

    conditions.update(inds)

    # Attach non-boolean context so downstream stages can read it
    conditions["_context"] = {
        "symbol":        symbol,
        "timeframe":     timeframe,
        "regime":        regime,
        "close":         state.get("close"),
        "swing_high":    state.get("swing_high"),
        "swing_low":     state.get("swing_low"),
        "range_position": state.get("range_position"),
    }

    return conditions


def active_conditions(conditions: dict) -> list[str]:
    """Return only the keys whose value is True (excluding context)."""
    return [
        k for k, v in conditions.items()
        if v is True and not k.startswith("_")
    ]


# ============================================================
# MAIN PIPELINE
# ============================================================

def run() -> int:
    """
    Execute one condition-evaluation cycle across every
    (symbol, timeframe) that has indicators in Redis.
    """
    log.info("=== conditions starting ===")

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
            bars       = rds.load_bars(symbol, tf)
            indicators = rds.load_indicators(symbol, tf)

            if not bars or not indicators:
                log.debug("Missing bars or indicators for %s %s — skipping", symbol, tf)
                continue

            conds = build_conditions(symbol, tf, bars, indicators)
            if not conds:
                log.warning("Could not build conditions for %s %s", symbol, tf)
                continue

            rds.save_conditions(symbol, tf, conds)

            active = active_conditions(conds)
            log.info(
                "  ✔ %s %s → regime=%s, %d active conditions",
                symbol, tf, conds["_context"]["regime"], len(active),
            )
            processed += 1

    log.info("=== conditions finished: %d pairs processed ===", processed)
    return processed


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        run()
        sys.exit(0)
    except Exception as e:
        log.exception("conditions failed: %s", e)
        sys.exit(1)
