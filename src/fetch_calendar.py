"""
fetch_calendar.py — Fetch economic calendar events via biquote.

biquote provides a free economic calendar from a MetaTrader 5 feed.
No API key required. Covers 54 countries; we filter to the 8 FX majors.

Self-guard uses `calendar_fetched_within` so the workflow can run every
3 hours while only hitting biquote every 6.
"""

import os
from datetime import datetime, timezone

from biquote import Biquote

from src import config
from src import supabase_client as sb
from src.config import (
    FINNHUB_HIGH_IMPACT_CURRENCIES,
    FINNHUB_CALENDAR_FETCH_INTERVAL_HOURS,
)


def fetch_events() -> list:
    """Fetch high-impact macro events for the 8 FX major currencies."""
    bq = Biquote()

    # biquote uses country codes, not currency codes. Map the 8 FX
    # currencies to their biquote country identifiers.
    country_map = {
        "USD": "US",
        "EUR": "EU",
        "GBP": "GB",
        "JPY": "JP",
        "AUD": "AU",
        "CHF": "CH",
        "CAD": "CA",
        "NZD": "NZ",
    }
    countries = ",".join(country_map.values())

    events = bq.calendar(
        importance="high",
        countries=countries,
    )
    return events or []


def normalise(event: dict) -> dict | None:
    """Map biquote event fields to our schema."""
    # biquote returns events with a `time` field (ISO 8601 or epoch).
    # Adjust these field names if the actual response format differs.
    event_time = event.get("time") or event.get("datetime")
    if not event_time:
        return None

    # biquote returns country codes; map back to currency codes.
    country = (event.get("country") or "").upper()
    currency_map = {
        "US": "USD", "EU": "EUR", "GB": "GBP", "JP": "JPY",
        "AU": "AUD", "CH": "CHF", "CA": "CAD", "NZ": "NZD",
    }
    currency = currency_map.get(country, country)

    if currency not in FINNHUB_HIGH_IMPACT_CURRENCIES:
        return None

    return {
        "event_name": event.get("event") or event.get("name", "unknown"),
        "currency": currency,
        "impact": (event.get("importance") or "high").lower(),
        "event_time": event_time,
        "forecast": str(event["forecast"]) if event.get("forecast") is not None else None,
        "previous": str(event["previous"]) if event.get("previous") is not None else None,
        "actual":   str(event["actual"])   if event.get("actual")   is not None else None,
    }


def main() -> None:
    config.require(
        "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
    )

    # Self-guard: skip if the calendar was fetched recently.
    if sb.calendar_fetched_within(FINNHUB_CALENDAR_FETCH_INTERVAL_HOURS):
        print(
            f"Calendar fetched within last "
            f"{FINNHUB_CALENDAR_FETCH_INTERVAL_HOURS}h — skipping"
        )
        return

    raw = fetch_events()
    rows = []
    for event in raw:
        row = normalise(event)
        if row:
            rows.append(row)

    if rows:
        sb.upsert_calendar_events(rows)
        sb.increment_api_usage("biquote", 1)
        print(f"Upserted {len(rows)} calendar events")
    else:
        print("No qualifying events found")


if __name__ == "__main__":
    main()
