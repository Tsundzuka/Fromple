# ============================================================
# src/fetch_cot.py
# ============================================================
# Fetches the latest Commitment of Traders (COT) report from
# the CFTC Socrata public API for every contract listed in
# config.COT_CONTRACTS, and upserts the rows into Supabase.
#
# Entry point: python -m src.fetch_cot
#
# Flow:
#   1. Exit if system_state.is_running = false
#   2. For each contract:
#         query the latest report_date row from CFTC
#         normalise the fields
#   3. Batch-upsert into cot_reports
#   4. Stamp last_successful_run

import logging
import sys
import time
from datetime import datetime, timezone
from typing import Any

import requests

from . import config
from . import supabase_client as sb

# ------------------------------------------------------------
# Logging
# ------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("fetch_cot")


# ------------------------------------------------------------
# Socrata config
# ------------------------------------------------------------
SOCRATA_TIMEOUT = 30
SECONDS_BETWEEN_CALLS = 1.5

SOCRATA_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Fromple/1.0 (research pipeline; contact: hello@fromple.ai)",
}


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
def _num(value: Any) -> float | None:
    """Coerce a Socrata numeric field to float, or None."""
    if value in (None, "", "null"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _get_field(row: dict, *candidates: str) -> Any:
    """
    Socrata sometimes renames columns between dataset versions.
    Return the first matching key from a list of candidates.
    """
    for key in candidates:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return None


# ------------------------------------------------------------
# CFTC fetch
# ------------------------------------------------------------
def fetch_latest(contract_name: str) -> dict | None:
    """
    Return the single latest COT report row for a contract.
    Matches on market_and_exchange_names starting with the
    contract_name. Returns None on failure or empty result.
    """
    params = {
        "$where":  f"market_and_exchange_names like '{contract_name}%'",
        "$order":  "report_date_as_yyyy_mm_dd DESC",
        "$limit":  1,
    }

    try:
        resp = requests.get(
            config.CFTC_SOCRATA_URL,
            params=params,
            headers=SOCRATA_HEADERS,
            timeout=SOCRATA_TIMEOUT,
        )
        resp.raise_for_status()
        rows = resp.json()
    except requests.RequestException as e:
        log.warning("CFTC request failed for %s: %s", contract_name, e)
        return None

    if not isinstance(rows, list) or not rows:
        log.warning("CFTC returned no rows for %s", contract_name)
        return None

    return rows[0]


# ------------------------------------------------------------
# Row mapping
# ------------------------------------------------------------
def map_row(contract_name: str, raw: dict) -> dict | None:
    """
    Convert a raw Socrata row into the cot_reports shape.
    Field names below reflect the 6dca-aqww dataset; if CFTC
    renames columns, `_get_field` tries multiple candidates.
    """
    report_date = _get_field(raw, "report_date_as_yyyy_mm_dd", "report_date")
    if not report_date:
        log.warning("Skipping %s — no report_date in row", contract_name)
        return None

    # Trim any time component; cot_reports.report_date is DATE
    report_date = str(report_date).split("T")[0].split(" ")[0]

    market_name = _get_field(raw, "market_and_exchange_names") or contract_name
    contract_short = contract_name

    noncomm_long  = _num(_get_field(raw, "noncomm_positions_long_all"))
    noncomm_short = _num(_get_field(raw, "noncomm_positions_short_all"))
    change_long   = _num(_get_field(raw, "change_in_noncomm_long_all"))
    change_short  = _num(_get_field(raw, "change_in_noncomm_short_all"))
    comm_long     = _num(_get_field(raw, "comm_positions_long_all"))
    comm_short    = _num(_get_field(raw, "comm_positions_short_all"))
    open_interest = _num(_get_field(raw, "open_interest_all"))

    noncomm_net = None
    if noncomm_long is not None and noncomm_short is not None:
        noncomm_net = noncomm_long - noncomm_short

    noncomm_net_change = None
    if change_long is not None and change_short is not None:
        noncomm_net_change = change_long - change_short

    return {
        "report_date":            report_date,
        "contract_name":          market_name,
        "contract_short":         contract_short,
        "noncomm_long":           noncomm_long,
        "noncomm_short":          noncomm_short,
        "noncomm_long_change":    change_long,
        "noncomm_short_change":   change_short,
        "comm_long":              comm_long,
        "comm_short":             comm_short,
        "open_interest":          open_interest,
        "noncomm_net":            noncomm_net,
        "noncomm_net_change":     noncomm_net_change,
    }


# ------------------------------------------------------------
# Main pipeline
# ------------------------------------------------------------
def run() -> int:
    """
    Execute one COT fetch cycle. Returns the number of rows
    successfully upserted.
    """
    log.info("=== fetch_cot starting ===")

    if not sb.is_pipeline_running():
        log.info("Pipeline is stopped (system_state.is_running = false). Exiting.")
        return 0

    rows: list[dict] = []

    for contract in config.COT_CONTRACTS:
        log.info("Fetching COT for: %s", contract)
        raw = fetch_latest(contract)

        if raw is None:
            time.sleep(SECONDS_BETWEEN_CALLS)
            continue

        mapped = map_row(contract, raw)
        if mapped:
            rows.append(mapped)
            log.info("  ✔ %s @ %s (net %s)", contract, mapped["report_date"], mapped["noncomm_net"])
        else:
            log.warning("  ✘ Could not map row for %s", contract)

        time.sleep(SECONDS_BETWEEN_CALLS)

    if not rows:
        log.warning("No COT rows to upsert this cycle.")
        return 0

    written = sb.upsert_cot_reports(rows)
    log.info("Upserted %d COT rows.", written)

    # CFTC has no hard quota; record the fetch count anyway for the GUI
    sb.increment_api_usage(provider="cftc", by=1, limit_value=0)

    sb.mark_successful_run()
    log.info("=== fetch_cot finished ===")
    return written


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        run()
        sys.exit(0)
    except Exception as e:
        log.exception("fetch_cot failed: %s", e)
        sys.exit(1)
