"""
fetch_calendar.py — Fetch economic calendar events from Finnhub.
"""

import os
import requests
from datetime import datetime, timedelta, timezone

from src.config import (
    FINNHUB_BASE_URL,
    FINNHUB_HIGH_IMPACT_CURRENCIES,
    FINNHUB_CALENDAR_LOOKAHEAD_DAYS,
)
from src.supabase_client import SupabaseClient

def fetch_events(api_key: str, from_date: str, to_date: str) -> list:
    """Fetch economic events between two dates."""
    url = f"{FINNHUB_BASE_URL}/calendar/economic"
    params = {
        "from": from_date,
        "to": to_date,
        "token": api_key,
    }
    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    payload = resp.json()
    return payload.get("economicCalendar", [])

def normalise(event: dict) -> dict | None:
    """Map Finnhub event fields to our schema."""
    event_time = event.get("time")  # ISO 8601 string
    if not event_time:
        return None

    currency = (event.get("country") or "").upper()
    if currency not in FINNHUB_HIGH_IMPACT_CURRENCIES:
        return None

    return {
        "event_name": event.get("event", "unknown"),
        "currency": currency,
        "impact": (event.get("impact") or "").lower() or None,
        "event_time": event_time,
        "forecast": str(event.get("estimate")) if event.get("estimate") is not None else None,
        "previous": str(event.get("prev")) if event.get("prev") is not None else None,
        "actual": str(event.get("actual")) if event.get("actual") is not None else None,
    }

def main():
    api_key = os.environ.get("FINNHUB_API_KEY")
    if not api_key:
        print("FINNHUB_API_KEY not set — exiting")
        return

    sb = SupabaseClient()
    today = datetime.now(timezone.utc).date()
    to_date = today + timedelta(days=FINNHUB_CALENDAR_LOOKAHEAD_DAYS)

    raw = fetch_events(api_key, today.isoformat(), to_date.isoformat())
    rows = []
    for event in raw:
        row = normalise(event)
        if row:
            rows.append(row)

    if rows:
        sb.upsert_calendar_events(rows)
        sb.increment_api_usage("finnhub", 1)
        print(f"Upserted {len(rows)} calendar events")
    else:
        print("No qualifying events found")

if __name__ == "__main__":
    main()
