"""
fetch_sentiment.py — Fetch FXNewsBias sentiment scores for 8 major currencies.

FXNewsBias refreshes every 3 hours. The free tier serves data one cycle
behind (delayed=true). History cannot be backfilled — every cycle not
recorded is permanently lost.
"""

import os
import requests

from src import config
from src import supabase_client as sb
from src.config import FXNEWSBIAS_BASE_URL, FXNEWSBIAS_SENTIMENT_PATH


def fetch_sentiment(api_key: str) -> dict | None:
    """Fetch current sentiment scores."""
    url = f"{FXNEWSBIAS_BASE_URL}{FXNEWSBIAS_SENTIMENT_PATH}"
    headers = {"Authorization": f"Bearer {api_key}"}
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    config.require(
        "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FXNEWSBIAS_API_KEY",
    )

    api_key = os.environ["FXNEWSBIAS_API_KEY"]

    payload = fetch_sentiment(api_key)
    if not payload:
        print("No sentiment data returned")
        return

    generated_at = payload.get("generated_at")
    if not generated_at:
        print("Response missing generated_at — cannot guard against duplicates")
        return

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
