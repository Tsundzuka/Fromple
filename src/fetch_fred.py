"""
fetch_fred.py — Fetch macro economic series from FRED.

FRED is the Federal Reserve Economic Data API. Series IDs are stable
identifiers (e.g. DFF, DGS10). The API returns observations as strings,
using "." for missing values. A single daily run is sufficient — FRED
series do not change intraday.
"""

import os
import requests

from src import config
from src import supabase_client as sb
from src.config import FRED_SERIES, FRED_BASE_URL


def fetch_series(series_id: str, api_key: str) -> dict | None:
    """Fetch the latest observation for a FRED series."""
    url = f"{FRED_BASE_URL}/series/observations"
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "desc",
        "limit": 1,
    }
    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    payload = resp.json()

    observations = payload.get("observations", [])
    if not observations:
        return None

    obs = observations[0]
    value = obs.get("value", ".")
    if value == ".":
        return None  # FRED uses '.' for missing data

    return {
        "series_id": series_id,
        "description": FRED_SERIES.get(series_id, series_id),
        "value": float(value),
        "observation_date": obs["date"],
    }


def main() -> None:
    config.require(
        "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FRED_API_KEY",
    )

    api_key = os.environ["FRED_API_KEY"]
    rows = []

    for series_id in FRED_SERIES:
        try:
            row = fetch_series(series_id, api_key)
            if row:
                rows.append(row)
                print(f"  {series_id}: {row['value']} ({row['observation_date']})")
            else:
                print(f"  {series_id}: no value")
        except Exception as e:
            print(f"  {series_id}: error — {e}")

    if rows:
        sb.upsert_macro_rates(rows)
        sb.increment_api_usage("fred", len(rows))
        print(f"Upserted {len(rows)} FRED rows")


if __name__ == "__main__":
    main()
