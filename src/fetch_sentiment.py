"""
fetch_sentiment.py — Fetch FXNewsBias sentiment scores for 8 major currencies.
"""

import os
import requests
from src.config import FXNB_BASE_URL, FXNB_SENTIMENT_ENDPOINT
from src.supabase_client import SupabaseClient

def fetch_sentiment(api_key: str) -> dict | None:
    """Fetch current sentiment scores."""
    url = f"{FXNB_BASE_URL}{FXNB_SENTIMENT_ENDPOINT}"
    headers = {"Authorization": f"Bearer {api_key}"}
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()

def main():
    api_key = os.environ.get("FXNEWSBIAS_API_KEY")
    if not api_key:
        print("FXNEWSBIAS_API_KEY not set — exiting")
        return

    sb = SupabaseClient()

    # Skip if latest generated_at already recorded
    payload = fetch_sentiment(api_key)
    if not payload:
        print("No sentiment data returned")
        return

    generated_at = payload.get("generated_at")
    if sb.sentiment_exists(generated_at):
        print(f"Sentiment for {generated_at} already recorded — skipping")
        return

    delayed = payload.get("delayed", True)
    rows = []
    for entry in payload.get("data", []):
        rows.append({
            "currency": entry["currency"],
            "score": int(entry["score"]),
            "bias": entry.get("bias"),
            "generated_at": generated_at,
            "source": "fxnewsbias",
            "delayed": delayed,
        })

    if rows:
        sb.upsert_sentiment_scores(rows)
        sb.increment_api_usage("fxnewsbias", 1)
        print(f"Upserted {len(rows)} sentiment scores for {generated_at}")
    else:
        print("No sentiment entries found")

if __name__ == "__main__":
    main()
