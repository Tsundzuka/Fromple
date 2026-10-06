"""
fetch_news.py — Fetch forex market news from Finnhub.

Finnhub's /news endpoint returns items with a Unix epoch `datetime`
field. Converted to timezone-aware ISO 8601 UTC. Upserts on `url`
as the natural key, so repeated runs are idempotent.

Self-guard skips runs where news was fetched within the configured
interval (FINNHUB_NEWS_FETCH_INTERVAL_HOURS).
"""

import os
import requests
from datetime import datetime, timezone

from src import config
from src import supabase_client as sb
from src.config import (
    FINNHUB_BASE_URL,
    FINNHUB_NEWS_CATEGORY,
    FINNHUB_NEWS_FETCH_INTERVAL_HOURS,
)


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
        published_at = datetime.fromtimestamp(
            published_at, tz=timezone.utc
        ).isoformat()

    related = item.get("related")

    return {
        "headline": headline,
        "source": item.get("source"),
        "url": url,
        "category": item.get("category"),
        "published_at": published_at,
        "related_symbols": related.split(",") if related else [],
    }


def main() -> None:
    config.require(
        "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FINNHUB_API_KEY",
    )

    # Self-guard: skip if news was fetched recently.
    if sb.news_fetched_within(FINNHUB_NEWS_FETCH_INTERVAL_HOURS):
        print(
            f"News fetched within last "
            f"{FINNHUB_NEWS_FETCH_INTERVAL_HOURS}h — skipping"
        )
        return

    api_key = os.environ["FINNHUB_API_KEY"]
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
