# ============================================================
# src/config.py
# ============================================================
# Central config loader. Reads from environment variables
# (GitHub Actions) or a local .env file.
#
# Secrets are optional at import time — each script validates
# only the variables it actually needs via require().
# This keeps the auxiliary workflow (FRED / Finnhub / FXNewsBias)
# from crashing on missing Twelve Data or Upstash credentials.

import os
from dotenv import load_dotenv

# Load .env when running locally. In GitHub Actions, env vars
# are already present and .env does not exist — this is a no-op.
load_dotenv()


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
def _opt(name: str, default: str | None = None) -> str | None:
    """Return an optional env var or a default."""
    return os.environ.get(name, default)


def require(*names: str) -> None:
    """
    Validate that the given env vars are set. Called by each
    script at the top of main() for the credentials it uses.

    Raises a clear error listing every missing var, so you
    don't play whack-a-mole one env var at a time.
    """
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}"
        )


# ------------------------------------------------------------
# Secrets — all optional at import; scripts call require()
# ------------------------------------------------------------
# Core (needed by every script that touches Supabase or Redis)
SUPABASE_URL              = _opt("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = _opt("SUPABASE_SERVICE_ROLE_KEY")
UPSTASH_REDIS_REST_URL    = _opt("UPSTASH_REDIS_REST_URL")
UPSTASH_REDIS_REST_TOKEN  = _opt("UPSTASH_REDIS_REST_TOKEN")

# Market data
TWELVEDATA_API_KEY        = _opt("TWELVEDATA_API_KEY")

# Auxiliary data providers
FINNHUB_API_KEY           = _opt("FINNHUB_API_KEY")
FRED_API_KEY              = _opt("FRED_API_KEY")
FXNEWSBIAS_API_KEY        = _opt("FXNEWSBIAS_API_KEY")

# AI interpretation layer
LLM_API_KEY               = _opt("LLM_API_KEY")
LLM_MODEL                 = _opt("LLM_MODEL", "gpt-4o-mini")
LLM_BASE_URL              = _opt("LLM_BASE_URL", "https://api.openai.com/v1")


# ------------------------------------------------------------
# External endpoints
# ------------------------------------------------------------
TWELVEDATA_BASE_URL           = "https://api.twelvedata.com"
CFTC_SOCRATA_URL              = "https://publicreporting.cftc.gov/resource/6dca-aqww.json"

FINNHUB_BASE_URL              = "https://finnhub.io/api/v1"

FRED_BASE_URL                 = "https://api.stlouisfed.org/fred"

FXNEWSBIAS_BASE_URL           = "https://fxnewsbias.com"
FXNEWSBIAS_SENTIMENT_PATH     = "/api/v1/sentiment"
FXNEWSBIAS_SESSION_BIAS_PATH  = "/api/v1/session-bias"   # Pro tier only


# ------------------------------------------------------------
# Pipeline parameters (defaults — overridable via Supabase settings)
# ------------------------------------------------------------
FORWARD_WINDOW    = int(_opt("FORWARD_WINDOW",    "24"))    # bars
THRESHOLD_PIPS    = int(_opt("THRESHOLD_PIPS",    "25"))
RATIO_FLOOR       = float(_opt("RATIO_FLOOR",     "1.5"))
MIN_OBSERVATIONS  = int(_opt("MIN_OBSERVATIONS",  "100"))
REGIME_LOOKBACK   = int(_opt("REGIME_LOOKBACK",   "200"))
STATE_LOOKBACK    = int(_opt("STATE_LOOKBACK",    "100"))
BARS_PER_FETCH    = int(_opt("BARS_PER_FETCH",    "500"))


# ------------------------------------------------------------
# Redis TTL (seconds)
# ------------------------------------------------------------
REDIS_TTL_SHORT = 60 * 60 * 6      # 6 hours  — control flags, last-run markers
REDIS_TTL_LONG  = 60 * 60 * 48     # 48 hours — bars, indicators, conditions


# ------------------------------------------------------------
# Instruments (fallback if sessions table is unreachable)
# ------------------------------------------------------------
DEFAULT_INSTRUMENTS = ["EUR/USD", "AUD/USD", "USD/CHF", "USD/CAD", "DXY"]

DEFAULT_TIMEFRAMES = ["M15", "H1", "H4"]


# ------------------------------------------------------------
# COT tracked contracts
# ------------------------------------------------------------
COT_CONTRACTS = [
    "EURO FX",
    "AUSTRALIAN DOLLAR",
    "SWISS FRANC",
    "CANADIAN DOLLAR",
    "USD INDEX",
    "GOLD",
    "WTI FINANCIAL CRUDE OIL",
    "JAPANESE YEN",
    "BRITISH POUND",
    "UST 10Y NOTE",
    "E-MINI S&P 500",
]


# ------------------------------------------------------------
# FRED — macro series to track
# ------------------------------------------------------------
# Series IDs are stable FRED identifiers. See:
# https://fred.stlouisfed.org/series/{id}
FRED_SERIES = {
    "DFF":      "Federal Funds Effective Rate",
    "DGS2":     "2-Year Treasury Yield",
    "DGS10":    "10-Year Treasury Yield",
    "T10Y2Y":   "10Y-2Y Treasury Spread",
    "DTWEXBGS": "Broad US Dollar Index",
    "CPIAUCSL": "Consumer Price Index",
}

# Daily run is sufficient — FRED series don't change intraday.
FRED_FETCH_INTERVAL_HOURS = int(_opt("FRED_FETCH_INTERVAL_HOURS", "24"))


# ------------------------------------------------------------
# Finnhub — calendar & news
# ------------------------------------------------------------
# Only events for these currencies are stored, to keep the
# calendar table focused on what matters for FX.
FINNHUB_HIGH_IMPACT_CURRENCIES = [
    "USD", "EUR", "GBP", "JPY", "AUD", "CHF", "CAD", "NZD",
]

# How many days ahead to pull calendar events.
FINNHUB_CALENDAR_LOOKAHEAD_DAYS = int(_opt("FINNHUB_CALENDAR_LOOKAHEAD_DAYS", "7"))

# News category — Finnhub supports: general, forex, crypto, merger
FINNHUB_NEWS_CATEGORY = _opt("FINNHUB_NEWS_CATEGORY", "forex")

# Minimum interval between fetches, enforced inside the scripts.
# The auxiliary workflow runs every 3h; each script self-guards.
FINNHUB_CALENDAR_FETCH_INTERVAL_HOURS = int(_opt("FINNHUB_CALENDAR_FETCH_INTERVAL_HOURS", "6"))
FINNHUB_NEWS_FETCH_INTERVAL_HOURS     = int(_opt("FINNHUB_NEWS_FETCH_INTERVAL_HOURS",     "2"))


# ------------------------------------------------------------
# FXNewsBias — sentiment
# ------------------------------------------------------------
# FXNewsBias refreshes every 3 hours. Free tier serves data one
# cycle behind (delayed = true). Pro tier is real-time.
#
# IMPORTANT: FXNewsBias serves forward data only. Historical
# sentiment cannot be backfilled. Start collecting immediately.
FXNEWSBIAS_FETCH_INTERVAL_HOURS = int(_opt("FXNEWSBIAS_FETCH_INTERVAL_HOURS", "3"))

# Score thresholds for bullish / bearish classification.
# Scores are 0-100 (0 = max bearish, 100 = max bullish).
SENTIMENT_BULLISH_THRESHOLD = int(_opt("SENTIMENT_BULLISH_THRESHOLD", "60"))
SENTIMENT_BEARISH_THRESHOLD = int(_opt("SENTIMENT_BEARISH_THRESHOLD", "40"))


# ------------------------------------------------------------
# AI interpretation layer
# ------------------------------------------------------------
# The AI layer reads pre-computed statistics from the registry
# and produces natural-language summaries. It never queries the
# raw data, never generates signals, and never writes back to
# the trading tables.
AI_INSIGHT_TOP_N_CLASSES     = int(_opt("AI_INSIGHT_TOP_N_CLASSES",     "10"))
AI_INSIGHT_TOP_N_CONDITIONS  = int(_opt("AI_INSIGHT_TOP_N_CONDITIONS",  "15"))
AI_INSIGHT_TOP_N_COMBINATIONS = int(_opt("AI_INSIGHT_TOP_N_COMBINATIONS", "10"))
AI_INSIGHT_MAX_INPUT_TOKENS  = int(_opt("AI_INSIGHT_MAX_INPUT_TOKENS",  "8000"))
AI_INSIGHT_TEMPERATURE       = float(_opt("AI_INSIGHT_TEMPERATURE",     "0.2"))


# ------------------------------------------------------------
# Sanity check on import (only when run as a script)
# ------------------------------------------------------------
if __name__ == "__main__":
    def _show(label: str, value: str | None) -> None:
        preview = "MISSING" if not value else f"{value[:40]}..."
        print(f"  {label:<24} {preview}")

    print("Config loaded:")
    _show("Supabase URL:",      SUPABASE_URL)
    _show("Twelve Data key:",   TWELVEDATA_API_KEY)
    _show("Upstash URL:",       UPSTASH_REDIS_REST_URL)
    _show("Finnhub key:",       FINNHUB_API_KEY)
    _show("FRED key:",          FRED_API_KEY)
    _show("FXNewsBias key:",    FXNEWSBIAS_API_KEY)
    _show("LLM key:",           LLM_API_KEY)

    print()
    print("Pipeline:")
    print(f"  Forward window:         {FORWARD_WINDOW} bars")
    print(f"  Threshold pips:         {THRESHOLD_PIPS}")
    print(f"  Ratio floor:            {RATIO_FLOOR}")
    print(f"  Min observations:       {MIN_OBSERVATIONS}")
    print(f"  Bars per fetch:         {BARS_PER_FETCH}")

    print()
    print("Auxiliary:")
    print(f"  FRED series:            {len(FRED_SERIES)} tracked")
    print(f"  Finnhub currencies:     {', '.join(FINNHUB_HIGH_IMPACT_CURRENCIES)}")
    print(f"  Finnhub news category:  {FINNHUB_NEWS_CATEGORY}")
    print(f"  Sentiment thresholds:   bearish < {SENTIMENT_BEARISH_THRESHOLD} < neutral < {SENTIMENT_BULLISH_THRESHOLD} < bullish")

    print()
    print("AI:")
    print(f"  Model:                  {LLM_MODEL}")
    print(f"  Base URL:               {LLM_BASE_URL}")
    print(f"  Top N classes:          {AI_INSIGHT_TOP_N_CLASSES}")
    print(f"  Top N conditions:       {AI_INSIGHT_TOP_N_CONDITIONS}")

    print()
    print(f"  COT contracts:          {len(COT_CONTRACTS)} tracked")
    print(f"  Default instruments:    {', '.join(DEFAULT_INSTRUMENTS)}")
