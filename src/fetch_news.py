"""
fetch_news.py — Fetch forex market news from Finnhub.
"""

import os
import requests
from datetime import datetime, timezone

from src.config import FINNHUB_BASE_URL, FINNHUB_NEWS_CATEGORY
from src.supabase_client import SupabaseClient

def fetch_news(api_key: str) -> list:
    """Fetch latest forex news items."""
    url = f"{FINNHUB_BASE_URL}/news"
    params = {
        "category": FINNHUB_NEWS_CATEGORY,
        "token": api_key,
    }
    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()

def normalise(item: dict) -> dict | None:
    """Map Finnhub news fields to our schema."""
    url = item.get("url")
    headline = item.get("headline")
    if not url or not headline:
        return None

    published_at = item.get("datetime")
    if published_at:
        published_at = datetime.fromtimestamp(published_at, tz=timezone.utc).isoformat()

    return {
        "headline": headline,
        "source": item.get("source"),
        "url": url,
        "category": item.get("category"),
        "published_at": published_at,
        "related_symbols": item.get("related", "").split(",") if item.get("related") else [],
    }

def main():
    api_key = os.environ.get("FINNHUB_API_KEY")
    if not api_key:
        print("FINNHUB_API_KEY not set — exiting")
        return

    sb = SupabaseClient()
    raw = fetch_news(api_key)
    rows = [normalise(item) for item in raw]
    rows = [r for r in rows if r]

    if rows:
        sb.upsert_news_items(rows)
        sb.increment_api_usage("finnhub", 1)
        print(f"Upserted {len(rows)} news items")
    else:
        print("No news items found")

if __name__ == "__main__":
    main()
