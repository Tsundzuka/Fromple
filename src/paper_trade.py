# ============================================================
# src/paper_trade.py
# ============================================================
# Closes expired open experiments: measures the favourable and
# adverse pip movement WITHIN the forward window, writes a
# permanent observation, and updates the parent signal's
# aggregate stats.
#
# BATCH MODE: handles any number of expired experiments in one
# cycle. Backfill can produce thousands at once; this file
# processes them all, computing MFE/MAE strictly between
# entry_at and expires_at.
#
# Entry point: python -m src.paper_trade

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
# Datetime normalisation
# ------------------------------------------------------------
def _norm_dt(value) -> str:
    """
    Normalise any datetime (string or object) to a sortable
    'YYYY-MM-DD HH:MM:SS' string. Strips timezone info — all
    datetimes in this system are UTC.
    """
    if value is None:
        return ""
    s = str(value).replace("T", " ").replace("Z", "")
    if "+" in s:
        s = s.split("+")[0]
    s = s.strip()
    if len(s) == 16:
        s += ":00"
    return s


def bars_in_window(
    bars: list[dict],
    entry_at,
    expires_at,
) -> list[dict]:
    """
    Return bars whose `datetime` falls within [entry_at, expires_at].
    This defines the forward window for MFE/MAE computation.
    """
    start = _norm_dt(entry_at)
    end   = _norm_dt(expires_at)
    if not start or not end:
        return []
    return [
        b for b in bars
        if start <= _norm_dt(b.get("datetime", "")) <= end
    ]


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
    else:
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

    if n < config.MIN_OBSERVATIONS:
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
    log.info("=== paper_trade starting (batch mode) ===")

    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped. Exiting.")
        return 0

    expired = sb.list_open_experiments(expired_only=True)
    if not expired:
        log.info("No expired experiments to close.")
        return 0

    log.info("Closing %d expired experiments", len(expired))

    closed = 0
    skipped = 0
    touched_signals: set[str] = set()

    # Cache bars and pip values per (symbol, timeframe) to avoid
    # re-reading Redis thousands of times during a big backfill.
    bars_cache: dict[tuple[str, str], list[dict]] = {}
    pip_cache:  dict[str, float] = {}

    for i, exp in enumerate(expired, start=1):
        symbol       = exp["symbol"]
        timeframe    = exp["timeframe"]
        direction    = exp["direction"]
        entry_price  = float(exp["entry_price"])
        entry_at     = exp["entry_at"]
        expires_at   = exp["expires_at"]

        key = (symbol, timeframe)
        if key not in bars_cache:
            bars_cache[key] = rds.load_bars(symbol, timeframe) or []
        bars = bars_cache[key]

        if not bars:
            skipped += 1
            continue

        window_bars = bars_in_window(bars, entry_at, expires_at)
        if not window_bars:
            skipped += 1
            continue

        if symbol not in pip_cache:
            pip_cache[symbol] = sb.get_instrument_pip_value(symbol)
        pip_value = pip_cache[symbol]

        fav, adv = compute_movement(entry_price, direction, window_bars, pip_value)

        obs = write_observation(exp, fav, adv)
        if not obs:
            log.warning("Failed to write observation for experiment %s", exp["id"])
            skipped += 1
            continue

        sb.close_open_experiment(
            experiment_id=exp["id"],
            favorable_pips=fav,
            adverse_pips=adv,
            observation_id=obs["id"],
        )

        touched_signals.add(exp["signal_id"])
        closed += 1

        if closed % 100 == 0:
            log.info("  progress: %d/%d closed", closed, len(expired))

    # Refresh aggregates once per signal
    log.info("Refreshing aggregate stats for %d signals", len(touched_signals))
    for sid in touched_signals:
        refresh_signal_stats(sid)

    log.info(
        "=== paper_trade finished: %d closed, %d skipped ===",
        closed, skipped,
    )
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
