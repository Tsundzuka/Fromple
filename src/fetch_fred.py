"""
fetch_fred.py — Fetch macro economic series from FRED.
No external dependencies beyond requests.
"""

import os
import requests
from datetime import datetime, timezone

from src.config import FRED_SERIES, FRED_BASE_URL
from src.supabase_client import SupabaseClient

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

def main():
    api_key = os.environ.get("FRED_API_KEY")
    if not api_key:
        print("FRED_API_KEY not set — exiting")
        return

    sb = SupabaseClient()
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
