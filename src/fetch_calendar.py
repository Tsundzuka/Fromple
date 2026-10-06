import os
import requests
from datetime import datetime, timedelta
from supabase import create_client

# --- Configuration ---
FINNHUB_API_KEY = os.environ["FINNHUB_API_KEY"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# How many days ahead to fetch (max 90 on free tier)
DAYS_AHEAD = 14

# --- Main function ---
def fetch_and_store_calendar():
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Check the control flag before doing anything
    state = supabase.table("system_state").select("is_running").eq("id", 1).single().execute()
    if not state.data or not state.data["is_running"]:
        print("System is stopped. Exiting.")
        return

    # Build the date range
    from_date = datetime.utcnow().strftime("%Y-%m-%d")
    to_date = (datetime.utcnow() + timedelta(days=DAYS_AHEAD)).strftime("%Y-%m-%d")

    # Fetch from Finnhub
    url = "https://finnhub.io/api/v1/calendar/economic"
    params = {
        "from": from_date,
        "to": to_date,
        "token": FINNHUB_API_KEY,
    }

    print(f"Fetching economic calendar from {from_date} to {to_date}...")
    response = requests.get(url, params=params)

    if response.status_code != 200:
        print(f"Finnhub error: {response.status_code} — {response.text}")
        return

    data = response.json()
    events = data.get("economicCalendar", [])
    print(f"Received {len(events)} events from Finnhub.")

    if not events:
        print("No events returned. Nothing to store.")
        return

    # Build rows for Supabase
    rows = []
    for event in events:
        rows.append({
            "event_date": event.get("date"),
            "country": event.get("country"),
            "event_name": event.get("event"),
            "impact": event.get("impact"),          # low, medium, high
            "actual": event.get("actual"),
            "estimate": event.get("estimate"),
            "previous": event.get("previous"),
            "unit": event.get("unit"),
            "currency": event.get("currency"),
            "source": "finnhub",
            "fetched_at": datetime.utcnow().isoformat(),
        })

    # Batch upsert (unique on event_date + country + event_name)
    result = (
        supabase.table("calendar_events")
        .upsert(rows, on_conflict="event_date,country,event_name")
        .execute()
    )

    print(f"Upserted {len(result.data)} calendar events.")

# --- Entry point ---
if __name__ == "__main__":
    fetch_and_store_calendar()
