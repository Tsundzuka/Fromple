# ============================================================
# src/config.py
# ============================================================
# Central config loader. Reads from environment variables
# (GitHub Actions) or a local .env file. Validates required
# vars and exposes pipeline constants.

import os
from dotenv import load_dotenv

# Load .env when running locally. In GitHub Actions, env vars
# are already present and .env does not exist — this is a no-op.
load_dotenv()


# ------------------------------------------------------------
# Helper
# ------------------------------------------------------------
def _req(name: str) -> str:
    """Return a required env var or raise a clear error."""
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return val


def _opt(name: str, default: str | None = None) -> str | None:
    """Return an optional env var or a default."""
    return os.environ.get(name, default)


# ------------------------------------------------------------
# Secrets (required)
# ------------------------------------------------------------
SUPABASE_URL              = _req("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = _req("SUPABASE_SERVICE_ROLE_KEY")
TWELVEDATA_API_KEY        = _req("TWELVEDATA_API_KEY")
UPSTASH_REDIS_REST_URL    = _req("UPSTASH_REDIS_REST_URL")
UPSTASH_REDIS_REST_TOKEN  = _req("UPSTASH_REDIS_REST_TOKEN")


# ------------------------------------------------------------
# Secrets (optional / planned)
# ------------------------------------------------------------
FINNHUB_API_KEY    = _opt("FINNHUB_API_KEY")
FXNEWSBIAS_API_KEY = _opt("FXNEWSBIAS_API_KEY")


# ------------------------------------------------------------
# External endpoints
# ------------------------------------------------------------
TWELVEDATA_BASE_URL = "https://api.twelvedata.com"
CFTC_SOCRATA_URL    = "https://publicreporting.cftc.gov/resource/6dca-aqww.json"
FINNHUB_BASE_URL    = "https://finnhub.io/api/v1"
FXNEWSBIAS_BASE_URL = "https://fxnewsbias.com/api"  # placeholder — adjust when key is issued


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
# Sanity check on import
# ------------------------------------------------------------
if __name__ == "__main__":
    print("Config loaded:")
    print(f"  Supabase URL:      {SUPABASE_URL[:40]}...")
    print(f"  Twelve Data key:   {TWELVEDATA_API_KEY[:6]}...")
    print(f"  Upstash URL:       {UPSTASH_REDIS_REST_URL[:40]}...")
    print(f"  Forward window:    {FORWARD_WINDOW}")
    print(f"  Threshold pips:    {THRESHOLD_PIPS}")
    print(f"  Ratio floor:       {RATIO_FLOOR}")
    print(f"  Min observations:  {MIN_OBSERVATIONS}")
    print(f"  Instruments:       {', '.join(DEFAULT_INSTRUMENTS)}")
    print(f"  COT contracts:     {len(COT_CONTRACTS)} tracked")
