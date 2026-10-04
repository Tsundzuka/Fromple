# ============================================================
# src/registry.py
# ============================================================
# Recomputes condition_stats and combination_stats from the
# observations ledger. Called after paper_trade has closed
# experiments.
#
# Entry point: python -m src.registry
#
# Condition stats, per (condition_key, class_id, direction):
#   - favorable_count   — times this condition was present and
#                         the observation was favorable
#   - unfavorable_count — same, but adverse
#   - avg_favorable     — mean favourable pips when present
#   - avg_adverse       — mean adverse pips when present
#
# Combination stats, per (combo_key, class_id, direction):
#   - same idea, but for pairs of conditions
#
# Active conditions for an observation are reconstructed from:
#   - class.regime        → regime.{regime}
#   - class.market_state  → state.{key} for true keys
#   - class.cot           → cot.{key}
#   - class.sentiment     → sentiment.{key}
#   - signal.variations   → ind.{key} / cal.{key} / news.{key}
#
# No schema changes needed. Everything is derived.

import logging
import sys
from itertools import combinations
from typing import Iterable

from . import supabase_client as sb

# ------------------------------------------------------------
# Logging
# ------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("registry")


# ------------------------------------------------------------
# Status thresholds (kept here, mirrored by paper_trade)
# ------------------------------------------------------------
MIN_OBSERVATIONS_FOR_ACTIVE = 100
RATIO_FLOOR = 1.5


# ============================================================
# RECONSTRUCTING ACTIVE CONDITIONS
# ============================================================

def conditions_from_class(class_row: dict) -> list[str]:
    """Return the defining condition keys that were active."""
    out: list[str] = []

    regime = class_row.get("regime")
    if regime:
        out.append(f"regime.{regime}")

    for key, val in (class_row.get("market_state") or {}).items():
        if val:
            out.append(f"state.{key}")

    for key, val in (class_row.get("cot") or {}).items():
        if val:
            out.append(f"cot.{key}")

    for key, val in (class_row.get("sentiment") or {}).items():
        if val:
            out.append(f"sentiment.{key}")

    return out


def conditions_from_variations(variations: dict) -> list[str]:
    """Return the variation condition keys that were active."""
    if not variations:
        return []
    return [k for k, v in variations.items() if v is True]


def all_conditions(class_row: dict, signal_row: dict) -> list[str]:
    """Union of defining + variation conditions for one firing."""
    return (
        conditions_from_class(class_row)
        + conditions_from_variations(signal_row.get("variations") or {})
    )


# ============================================================
# CLASSIFIED OUTCOME
# ============================================================

def is_favorable(observation: dict) -> bool:
    """An observation is favorable when favourable > adverse."""
    fav = float(observation.get("favorable_pips") or 0)
    adv = float(observation.get("adverse_pips")   or 0)
    return fav > adv


# ============================================================
# FETCHERS
# ============================================================

def fetch_classes_with_observations() -> list[str]:
    """
    Return the list of class_ids that have at least one
    observation. We batch by class to keep queries small.
    """
    try:
        res = (
            sb._get()
            .table("observations")
            .select("class_id")
            .execute()
        )
        rows = res.data or []
        return sorted({r["class_id"] for r in rows if r.get("class_id")})
    except Exception as e:
        log.warning("fetch_classes_with_observations failed: %s", e)
        return []


def fetch_class(class_id: str) -> dict | None:
    try:
        res = (
            sb._get()
            .table("classes")
            .select("id, class_code, regime, market_state, cot, sentiment")
            .eq("id", class_id)
            .maybe_single()
            .execute()
        )
        return res.data if res else None
    except Exception as e:
        log.warning("fetch_class(%s) failed: %s", class_id, e)
        return None


def fetch_signals_for_class(class_id: str) -> dict[str, dict]:
    """Return {signal_id: row} for this class."""
    try:
        res = (
            sb._get()
            .table("signals")
            .select("id, signal_code, direction, variations")
            .eq("class_id", class_id)
            .execute()
        )
        return {r["id"]: r for r in (res.data or [])}
    except Exception as e:
        log.warning("fetch_signals_for_class(%s) failed: %s", class_id, e)
        return {}


def fetch_observations_for_class(class_id: str) -> list[dict]:
    try:
        res = (
            sb._get()
            .table("observations")
            .select("id, signal_id, direction, favorable_pips, adverse_pips")
            .eq("class_id", class_id)
            .execute()
        )
        return res.data or []
    except Exception as e:
        log.warning("fetch_observations_for_class(%s) failed: %s", class_id, e)
        return []


# ============================================================
# AGGREGATION
# ============================================================

def tally_conditions(
    observations: list[dict],
    signals_by_id: dict[str, dict],
    class_row: dict,
) -> dict[tuple[str, str], dict]:
    """
    Return a dict keyed by (condition_key, direction) whose value
    holds favorable_count, unfavorable_count, sum_fav, sum_adv.
    """
    tally: dict[tuple[str, str], dict] = {}

    for obs in observations:
        signal = signals_by_id.get(obs.get("signal_id"))
        if not signal:
            continue

        direction = obs.get("direction")
        if direction not in ("long", "short"):
            continue

        conditions = all_conditions(class_row, signal)
        favorable = is_favorable(obs)
        fav_pips = float(obs.get("favorable_pips") or 0)
        adv_pips = float(obs.get("adverse_pips")   or 0)

        for cond in conditions:
            key = (cond, direction)
            slot = tally.setdefault(key, {
                "favorable_count":   0,
                "unfavorable_count": 0,
                "sum_fav":           0.0,
                "sum_adv":           0.0,
            })
            if favorable:
                slot["favorable_count"] += 1
            else:
                slot["unfavorable_count"] += 1
            slot["sum_fav"] += fav_pips
            slot["sum_adv"] += adv_pips

    return tally


def tally_combinations(
    observations: list[dict],
    signals_by_id: dict[str, dict],
    class_row: dict,
    max_pair_size: int = 2,
) -> dict[tuple[str, str], dict]:
    """
    Return a dict keyed by (combo_key, direction). Combo keys are
    pairs of active conditions, sorted alphabetically, joined by
    '&'. Only pairs are considered for now (max_pair_size = 2).
    """
    tally: dict[tuple[str, str], dict] = {}

    for obs in observations:
        signal = signals_by_id.get(obs.get("signal_id"))
        if not signal:
            continue

        direction = obs.get("direction")
        if direction not in ("long", "short"):
            continue

        conditions = sorted(set(all_conditions(class_row, signal)))
        if len(conditions) < max_pair_size:
            continue

        favorable = is_favorable(obs)
        fav_pips = float(obs.get("favorable_pips") or 0)
        adv_pips = float(obs.get("adverse_pips")   or 0)

        for pair in combinations(conditions, max_pair_size):
            combo_key = "&".join(pair)
            key = (combo_key, direction)
            slot = tally.setdefault(key, {
                "occurrences":       0,
                "favorable_count":   0,
                "unfavorable_count": 0,
                "sum_fav":           0.0,
                "sum_adv":           0.0,
            })
            slot["occurrences"] += 1
            if favorable:
                slot["favorable_count"] += 1
            else:
                slot["unfavorable_count"] += 1
            slot["sum_fav"] += fav_pips
            slot["sum_adv"] += adv_pips

    return tally


# ============================================================
# WRITE-BACK
# ============================================================

def write_condition_stats(class_id: str, tally: dict) -> int:
    written = 0
    for (cond_key, direction), slot in tally.items():
        n = slot["favorable_count"] + slot["unfavorable_count"]
        avg_fav = round(slot["sum_fav"] / n, 4) if n else None
        avg_adv = round(slot["sum_adv"] / n, 4) if n else None

        sb.upsert_condition_stat({
            "condition_key":     cond_key,
            "class_id":          class_id,
            "direction":         direction,
            "favorable_count":   slot["favorable_count"],
            "unfavorable_count": slot["unfavorable_count"],
            "avg_favorable":     avg_fav,
            "avg_adverse":       avg_adv,
        })
        written += 1
    return written


def write_combination_stats(class_id: str, tally: dict) -> int:
    written = 0
    for (combo_key, direction), slot in tally.items():
        n = slot["occurrences"]
        avg_fav = round(slot["sum_fav"] / n, 4) if n else None
        avg_adv = round(slot["sum_adv"] / n, 4) if n else None

        sb.upsert_combination_stat({
            "combo_key":         combo_key,
            "class_id":          class_id,
            "direction":         direction,
            "occurrences":       slot["occurrences"],
            "favorable_count":   slot["favorable_count"],
            "unfavorable_count": slot["unfavorable_count"],
            "avg_favorable":     avg_fav,
            "avg_adverse":       avg_adv,
        })
        written += 1
    return written


# ============================================================
# CLASS STATUS REFRESH
# ============================================================

def refresh_class_status(class_id: str) -> None:
    """
    Set the class's status based on its signals' aggregate ratio.
    Uses the longest-lived signal in the class as the reference.
    """
    try:
        res = (
            sb._get()
            .table("signals")
            .select("recurrences, avg_favorable, avg_adverse, status")
            .eq("class_id", class_id)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        log.warning("refresh_class_status fetch failed: %s", e)
        return

    if not rows:
        return

    # Best signal by recurrence count
    best = max(rows, key=lambda r: r.get("recurrences") or 0)
    n = best.get("recurrences") or 0
    fav = best.get("avg_favorable")
    adv = best.get("avg_adverse")

    if n < MIN_OBSERVATIONS_FOR_ACTIVE:
        status = "watching"
    elif fav is None or adv in (None, 0):
        status = "watching"
    else:
        ratio = fav / abs(adv)
        status = "active" if ratio >= RATIO_FLOOR else "filtered"

    try:
        (
            sb._get()
            .table("classes")
            .update({"status": status})
            .eq("id", class_id)
            .execute()
        )
    except Exception as e:
        log.warning("refresh_class_status update failed: %s", e)


# ============================================================
# MAIN PIPELINE
# ============================================================

def run() -> int:
    """
    Recompute condition_stats and combination_stats for every
    class that has observations. Returns the number of classes
    processed.
    """
    log.info("=== registry starting ===")

    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped. Exiting.")
        return 0

    class_ids = fetch_classes_with_observations()
    if not class_ids:
        log.info("No classes with observations. Exiting.")
        return 0

    log.info("Recomputing stats for %d classes", len(class_ids))
    processed = 0

    for class_id in class_ids:
        class_row = fetch_class(class_id)
        if not class_row:
            continue

        signals_by_id = fetch_signals_for_class(class_id)
        observations = fetch_observations_for_class(class_id)

        if not observations or not signals_by_id:
            continue

        cond_tally = tally_conditions(observations, signals_by_id, class_row)
        combo_tally = tally_combinations(observations, signals_by_id, class_row)

        cond_written  = write_condition_stats(class_id, cond_tally)
        combo_written = write_combination_stats(class_id, combo_tally)

        refresh_class_status(class_id)

        log.info(
            "  ✔ Class %s — %d observations, %d condition rows, %d combination rows",
            class_row.get("class_code"),
            len(observations),
            cond_written,
            combo_written,
        )
        processed += 1

    log.info("=== registry finished: %d classes processed ===", processed)
    return processed


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        run()
        sys.exit(0)
    except Exception as e:
        log.exception("registry failed: %s", e)
        sys.exit(1)
