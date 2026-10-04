# ============================================================
# src/paper_trade.py
# ============================================================
# Closes expired open experiments: measures the favourable and
# adverse pip movement since entry, writes a permanent
# observation, and updates the parent signal's aggregate stats.
#
# Entry point: python -m src.paper_trade
#
# Flow:
#   1. Exit if system_state.is_running = false
#   2. Load every open_experiments row whose expires_at <= now
#   3. For each:
#         load bars, compute MFE / MAE in pips
#         insert an observation
#         close the experiment
#   4. Recompute per-signal aggregates (wins, losses,
#      avg_favorable, avg_adverse, status)
#
# Pip values are per-symbol. FX pairs use 0.0001; the USD Index
# uses 0.01 (index points). No JPY pairs are enabled.

import logging
import sys
from datetime import datetime, timezone
from typing import Sequence

from . import config
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
log = logging.getLogger("paper_trade")


# ------------------------------------------------------------
# Pip values per symbol
# ------------------------------------------------------------
PIP_VALUE = {
    "EUR/USD": 0.0001,
    "AUD/USD": 0.0001,
    "USD/CHF": 0.0001,
    "USD/CAD": 0.0001,
    "DXY":     0.01,
}


def get_pip_value(symbol: str) -> float:
    return PIP_VALUE.get(symbol, 0.0001)


# ------------------------------------------------------------
# Bar filtering
# ------------------------------------------------------------
def bars_since(bars: list[dict], since_iso: str) -> list[dict]:
    """
    Return bars whose `datetime` is at or after `since_iso`.
    Bar datetimes from Twelve Data look like "2025-01-15 13:00:00"
    or "2025-01-15". We normalise for a lexicographic compare.
    """
    def norm(s: str) -> str:
        return s.replace("T", " ").replace("Z", "")

    target = norm(since_iso)
    return [b for b in bars if norm(str(b.get("datetime", ""))) >= target]


# ------------------------------------------------------------
# Movement computation
# ------------------------------------------------------------
def compute_movement(
    entry_price: float,
    direction: str,
    bars: Sequence[dict],
    pip_value: float,
) -> tuple[float, float]:
    """
    Return (favorable_pips, adverse_pips) as positive numbers.
    Direction is 'long' or 'short'.
    """
    if not bars or entry_price is None or entry_price <= 0 or pip_value <= 0:
        return (0.0, 0.0)

    highs = [b["high"] for b in bars if b.get("high") is not None]
    lows  = [b["low"]  for b in bars if b.get("low")  is not None]

    if not highs or not lows:
        return (0.0, 0.0)

    max_high = max(highs)
    min_low  = min(lows)

    if direction == "long":
        favorable = (max_high - entry_price) / pip_value
        adverse   = (entry_price - min_low)  / pip_value
    else:  # short
        favorable = (entry_price - min_low)  / pip_value
        adverse   = (max_high - entry_price) / pip_value

    return (max(0.0, favorable), max(0.0, adverse))


# ------------------------------------------------------------
# Observation write
# ------------------------------------------------------------
def write_observation(
    experiment: dict,
    favorable_pips: float,
    adverse_pips: float,
) -> dict | None:
    """
    Append a permanent observation row. The unique key is
    (signal_id, fired_at, direction), so re-runs on the same
    experiment cannot duplicate.
    """
    payload = {
        "signal_id":      experiment["signal_id"],
        "class_id":       experiment["class_id"],
        "symbol":         experiment["symbol"],
        "timeframe":      experiment["timeframe"],
        "fired_at":       experiment["entry_at"],
        "direction":      experiment["direction"],
        "entry_price":    experiment["entry_price"],
        "favorable_pips": favorable_pips,
        "adverse_pips":   adverse_pips,
        "forward_window": experiment["forward_window"],
    }
    return sb.insert_observation(payload)


# ------------------------------------------------------------
# Signal aggregate update
# ------------------------------------------------------------
def refresh_signal_stats(signal_id: str) -> None:
    """
    Recompute wins / losses / avg_favorable / avg_adverse / status
    for a signal from its observations.
    """
    try:
        res = (
            sb._get()
            .table("observations")
            .select("favorable_pips, adverse_pips")
            .eq("signal_id", signal_id)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        log.warning("refresh_signal_stats fetch failed: %s", e)
        return

    n = len(rows)
    if n == 0:
        return

    favors = [float(r.get("favorable_pips") or 0) for r in rows]
    advers = [float(r.get("adverse_pips")   or 0) for r in rows]

    avg_fav = sum(favors) / n
    avg_adv = sum(advers) / n

    wins   = sum(1 for f, a in zip(favors, advers) if f > a)
    losses = n - wins

    ratio = (avg_fav / avg_adv) if avg_adv > 0 else None

    # Status thresholds come from config; per-user overrides come later
    if n < 20:
        status = "watching"
    elif ratio is None or ratio >= config.RATIO_FLOOR:
        status = "active"
    else:
        status = "filtered"

    try:
        (
            sb._get()
            .table("signals")
            .update({
                "wins":          wins,
                "losses":        losses,
                "avg_favorable": round(avg_fav, 4),
                "avg_adverse":   round(avg_adv, 4),
                "status":        status,
                "updated_at":    datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", signal_id)
            .execute()
        )
    except Exception as e:
        log.warning("refresh_signal_stats update failed: %s", e)


# ============================================================
# MAIN PIPELINE
# ============================================================

def run() -> int:
    """
    Close every expired open experiment. Returns the number of
    experiments closed.
    """
    log.info("=== paper_trade starting ===")

    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped. Exiting.")
        return 0

    expired = sb.list_open_experiments(expired_only=True)
    if not expired:
        log.info("No expired experiments to close.")
        return 0

    log.info("Closing %d expired experiments", len(expired))
    closed = 0
    touched_signals: set[str] = set()

    for exp in expired:
        symbol = exp["symbol"]
        timeframe = exp["timeframe"]
        direction = exp["direction"]
        entry_price = float(exp["entry_price"])
        entry_at = exp["entry_at"]

        bars = rds.load_bars(symbol, timeframe)
        if not bars:
            log.debug("No bars in Redis for %s %s — skipping experiment %s",
                      symbol, timeframe, exp["id"])
            continue

        window_bars = bars_since(bars, entry_at)
        if not window_bars:
            log.debug("No bars after entry for %s %s — skipping",
                      symbol, timeframe)
            continue

        pip_value = get_pip_value(symbol)
        fav, adv = compute_movement(entry_price, direction, window_bars, pip_value)

        obs = write_observation(exp, fav, adv)
        if not obs:
            log.warning("Failed to write observation for experiment %s", exp["id"])
            continue

        sb.close_open_experiment(
            experiment_id=exp["id"],
            favorable_pips=fav,
            adverse_pips=adv,
            observation_id=obs["id"],
        )

        touched_signals.add(exp["signal_id"])
        log.info(
            "  ✔ closed %s %s → fav=%.1f adv=%.1f",
            exp["signal_id"], direction, fav, adv,
        )
        closed += 1

    # Refresh aggregates once per signal
    for sid in touched_signals:
        refresh_signal_stats(sid)

    log.info("=== paper_trade finished: %d experiments closed ===", closed)
    return closed


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        run()
        sys.exit(0)
    except Exception as e:
        log.exception("paper_trade failed: %s", e)
        sys.exit(1)
