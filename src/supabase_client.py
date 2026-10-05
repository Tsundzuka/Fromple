# ============================================================
# src/supabase_client.py
# ============================================================
# Thin wrapper around supabase-py. Every method is scoped to a
# specific pipeline need — no generic query builder leaks out.
#
# IMPORTANT: supabase-py's .maybe_single().execute() returns
# None (not an object with .data = None) when no row matches.
# Every read that uses maybe_single is guarded accordingly.
#
# IMPORTANT: some supabase-py versions do not support chaining
# .insert().select().single(). All write helpers read the
# inserted row directly from res.data instead.

import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from supabase import create_client, Client

from . import config

log = logging.getLogger(__name__)

_client: Client | None = None


def _get() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            config.SUPABASE_URL,
            config.SUPABASE_SERVICE_ROLE_KEY,
        )
    return _client


def _maybe_row(resp) -> dict | None:
    """Safely extract a single row from a maybe_single response."""
    if resp is None:
        return None
    data = getattr(resp, "data", None)
    if isinstance(data, list):
        return data[0] if data else None
    return data


def _first_row(resp) -> dict | None:
    """Extract the first row from a standard insert/upsert response."""
    if resp is None:
        return None
    data = getattr(resp, "data", None)
    if isinstance(data, list):
        return data[0] if data else None
    return data


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------
# SYSTEM STATE
# ------------------------------------------------------------
def is_pipeline_running() -> bool:
    """Return True only if system_state.is_running is TRUE."""
    try:
        res = (
            _get()
            .table("system_state")
            .select("is_running")
            .eq("id", 1)
            .maybe_single()
            .execute()
        )
        row = _maybe_row(res)
        return bool(row and row.get("is_running"))
    except Exception as e:
        log.warning("is_pipeline_running failed: %s", e)
        return False


def mark_successful_run() -> None:
    """Stamp last_successful_run with the current UTC time."""
    try:
        (
            _get()
            .table("system_state")
            .update({
                "last_successful_run": _now_iso(),
                "updated_at": _now_iso(),
            })
            .eq("id", 1)
            .execute()
        )
    except Exception as e:
        log.warning("mark_successful_run failed: %s", e)


# ------------------------------------------------------------
# SESSIONS
# ------------------------------------------------------------
def get_active_sessions() -> list[dict]:
    """Return every active session row (all users)."""
    try:
        res = (
            _get()
            .table("sessions")
            .select("user_id, symbol, start_utc, end_utc, timeframes, active")
            .eq("active", True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        log.warning("get_active_sessions failed: %s", e)
        return []


# ------------------------------------------------------------
# INSTRUMENTS (canonical registry)
# ------------------------------------------------------------
def get_active_instruments() -> dict[str, str]:
    """
    Return {symbol: provider_symbol} for every active instrument.
    Example: {'EUR/USD': 'EUR/USD', 'DXY': 'DXY'}
    """
    try:
        res = (
            _get()
            .table("instruments")
            .select("symbol, provider_symbol")
            .eq("is_active", True)
            .execute()
        )
        return {
            r["symbol"]: r["provider_symbol"]
            for r in (res.data or [])
            if r.get("symbol") and r.get("provider_symbol")
        }
    except Exception as e:
        log.warning("get_active_instruments failed: %s", e)
        return {}


def get_instrument_pip_value(symbol: str) -> float:
    """Return the pip_value for a symbol, or 0.0001 as a safe default."""
    try:
        res = (
            _get()
            .table("instruments")
            .select("pip_value")
            .eq("symbol", symbol)
            .maybe_single()
            .execute()
        )
        row = _maybe_row(res)
        if row and row.get("pip_value") is not None:
            return float(row["pip_value"])
    except Exception as e:
        log.warning("get_instrument_pip_value(%s) failed: %s", symbol, e)
    return 0.0001


# ------------------------------------------------------------
# TIMEFRAMES (canonical registry)
# ------------------------------------------------------------
def get_timeframe_map() -> dict[str, dict]:
    """
    Return {code: {'provider_interval': str, 'duration_minutes': int}}
    for every active timeframe.
    Example: {'M1': {'provider_interval': '1min', 'duration_minutes': 1}, ...}
    """
    try:
        res = (
            _get()
            .table("timeframes")
            .select("code, provider_interval, duration_minutes")
            .eq("is_active", True)
            .execute()
        )
        return {
            r["code"]: {
                "provider_interval": r["provider_interval"],
                "duration_minutes": int(r["duration_minutes"]),
            }
            for r in (res.data or [])
            if r.get("code")
        }
    except Exception as e:
        log.warning("get_timeframe_map failed: %s", e)
        return {}


# ------------------------------------------------------------
# SETTINGS (per-user key/value)
# ------------------------------------------------------------
def get_setting(user_id: str, key: str) -> Any | None:
    try:
        res = (
            _get()
            .table("settings")
            .select("value")
            .eq("user_id", user_id)
            .eq("key", key)
            .maybe_single()
            .execute()
        )
        row = _maybe_row(res)
        return row.get("value") if row else None
    except Exception as e:
        log.warning("get_setting(%s, %s) failed: %s", user_id, key, e)
        return None


def upsert_setting(user_id: str, key: str, value: Any) -> None:
    try:
        (
            _get()
            .table("settings")
            .upsert(
                {
                    "user_id": user_id,
                    "key": key,
                    "value": value,
                    "updated_at": _now_iso(),
                },
                on_conflict="user_id,key",
            )
            .execute()
        )
    except Exception as e:
        log.warning("upsert_setting(%s, %s) failed: %s", user_id, key, e)


# ------------------------------------------------------------
# API USAGE
# ------------------------------------------------------------
def increment_api_usage(provider: str, by: int = 1, limit_value: int = 0) -> None:
    """
    Increment today's usage counter for a provider. Creates the
    row if it doesn't exist. The period is keyed to the current
    UTC day.
    """
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    period_start = today.isoformat()
    period_end   = today.replace(hour=23, minute=59, second=59).isoformat()

    try:
        res = (
            _get()
            .table("api_usage")
            .select("id, used")
            .eq("provider", provider)
            .eq("period_start", period_start)
            .maybe_single()
            .execute()
        )
        row = _maybe_row(res)

        if row:
            new_used = (row.get("used") or 0) + by
            (
                _get()
                .table("api_usage")
                .update({
                    "used": new_used,
                    "updated_at": _now_iso(),
                })
                .eq("id", row["id"])
                .execute()
            )
        else:
            (
                _get()
                .table("api_usage")
                .insert({
                    "provider": provider,
                    "used": by,
                    "limit_value": limit_value or 0,
                    "period_start": period_start,
                    "period_end": period_end,
                })
                .execute()
            )
    except Exception as e:
        log.warning("increment_api_usage(%s) failed: %s", provider, e)


# ------------------------------------------------------------
# COT REPORTS
# ------------------------------------------------------------
def upsert_cot_reports(rows: list[dict]) -> int:
    """Upsert a list of COT rows. Returns the number of rows written."""
    if not rows:
        return 0
    try:
        (
            _get()
            .table("cot_reports")
            .upsert(rows, on_conflict="report_date,contract_name")
            .execute()
        )
        return len(rows)
    except Exception as e:
        log.error("upsert_cot_reports failed: %s", e)
        return 0


# ============================================================
# AUXILIARY DATA
# ============================================================
# Four external feeds feeding into the registry:
#   - FRED          → macro_rates
#   - Finnhub cal   → calendar_events
#   - Finnhub news  → news_items
#   - FXNewsBias    → sentiment_scores
#
# Each section provides:
#   - an upsert writer (idempotent on the natural key)
#   - a "recently fetched?" guard so scripts can exit early
#   - a reader for conditions.py / class_engine.py
# ============================================================


# ------------------------------------------------------------
# FRED — macro rates
# ------------------------------------------------------------
def upsert_macro_rates(rows: list[dict]) -> int:
    """Upsert FRED observations. Natural key: (series_id, observation_date)."""
    if not rows:
        return 0
    try:
        (
            _get()
            .table("macro_rates")
            .upsert(rows, on_conflict="series_id,observation_date")
            .execute()
        )
        return len(rows)
    except Exception as e:
        log.error("upsert_macro_rates failed: %s", e)
        return 0


def macro_fetched_within(hours: int) -> bool:
    """True if any macro_rates row was fetched within the last N hours."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    try:
        res = (
            _get()
            .table("macro_rates")
            .select("id")
            .gte("fetched_at", cutoff)
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        log.warning("macro_fetched_within failed: %s", e)
        return False


def get_latest_macro_rates() -> dict[str, dict]:
    """
    Return {series_id: {'value': float, 'observation_date': str}} for
    the most recent observation of each series. Used by conditions.py.
    """
    try:
        res = (
            _get()
            .table("macro_rates")
            .select("series_id, value, observation_date")
            .order("observation_date", desc=True)
            .execute()
        )
        out: dict[str, dict] = {}
        for row in (res.data or []):
            sid = row.get("series_id")
            if sid and sid not in out:
                out[sid] = {
                    "value": row.get("value"),
                    "observation_date": row.get("observation_date"),
                }
        return out
    except Exception as e:
        log.warning("get_latest_macro_rates failed: %s", e)
        return {}


# ------------------------------------------------------------
# FINNHUB — economic calendar
# ------------------------------------------------------------
def upsert_calendar_events(rows: list[dict]) -> int:
    """Upsert economic calendar events. Natural key: (event_name, currency, event_time)."""
    if not rows:
        return 0
    try:
        (
            _get()
            .table("calendar_events")
            .upsert(rows, on_conflict="event_name,currency,event_time")
            .execute()
        )
        return len(rows)
    except Exception as e:
        log.error("upsert_calendar_events failed: %s", e)
        return 0


def calendar_fetched_within(hours: int) -> bool:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    try:
        res = (
            _get()
            .table("calendar_events")
            .select("id")
            .gte("fetched_at", cutoff)
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        log.warning("calendar_fetched_within failed: %s", e)
        return False


def get_calendar_window(start_iso: str, end_iso: str) -> list[dict]:
    """
    Return calendar events with event_time in [start_iso, end_iso].
    Used by conditions.py to detect nearby high-impact events.
    """
    try:
        res = (
            _get()
            .table("calendar_events")
            .select("event_name, currency, impact, event_time, forecast, previous, actual")
            .gte("event_time", start_iso)
            .lte("event_time", end_iso)
            .order("event_time")
            .execute()
        )
        return res.data or []
    except Exception as e:
        log.warning("get_calendar_window failed: %s", e)
        return []


# ------------------------------------------------------------
# FINNHUB — news
# ------------------------------------------------------------
def upsert_news_items(rows: list[dict]) -> int:
    """Upsert news items. Natural key: url."""
    if not rows:
        return 0
    try:
        (
            _get()
            .table("news_items")
            .upsert(rows, on_conflict="url")
            .execute()
        )
        return len(rows)
    except Exception as e:
        log.error("upsert_news_items failed: %s", e)
        return 0


def news_fetched_within(hours: int) -> bool:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    try:
        res = (
            _get()
            .table("news_items")
            .select("id")
            .gte("fetched_at", cutoff)
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        log.warning("news_fetched_within failed: %s", e)
        return False


def get_recent_news(since_iso: str) -> list[dict]:
    """
    Return news items published since the given ISO timestamp.
    Used by conditions.py to detect active news windows.
    """
    try:
        res = (
            _get()
            .table("news_items")
            .select("headline, source, url, category, published_at, related_symbols")
            .gte("published_at", since_iso)
            .order("published_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        log.warning("get_recent_news failed: %s", e)
        return []


# ------------------------------------------------------------
# FXNEWSBIAS — sentiment scores
# ------------------------------------------------------------
def upsert_sentiment_scores(rows: list[dict]) -> int:
    """Upsert sentiment scores. Natural key: (currency, generated_at)."""
    if not rows:
        return 0
    try:
        (
            _get()
            .table("sentiment_scores")
            .upsert(rows, on_conflict="currency,generated_at")
            .execute()
        )
        return len(rows)
    except Exception as e:
        log.error("upsert_sentiment_scores failed: %s", e)
        return 0


def sentiment_exists(generated_at: str) -> bool:
    """
    True if any sentiment row already exists for this cycle.
    Used by fetch_sentiment.py to skip redundant API calls when
    the 3-hour cycle has not advanced.
    """
    if not generated_at:
        return False
    try:
        res = (
            _get()
            .table("sentiment_scores")
            .select("id")
            .eq("generated_at", generated_at)
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        log.warning("sentiment_exists(%s) failed: %s", generated_at, e)
        return False


def get_latest_sentiment() -> dict[str, dict]:
    """
    Return {currency: {'score': int, 'bias': str, 'generated_at': str}}
    for the most recent cycle of each currency. Used by conditions.py.
    """
    try:
        res = (
            _get()
            .table("sentiment_scores")
            .select("currency, score, bias, generated_at")
            .order("generated_at", desc=True)
            .execute()
        )
        out: dict[str, dict] = {}
        for row in (res.data or []):
            cur = row.get("currency")
            if cur and cur not in out:
                out[cur] = {
                    "score": int(row.get("score") or 0),
                    "bias": row.get("bias"),
                    "generated_at": row.get("generated_at"),
                }
        return out
    except Exception as e:
        log.warning("get_latest_sentiment failed: %s", e)
        return {}


# ------------------------------------------------------------
# CLASSES / SIGNALS / OBSERVATIONS
# ------------------------------------------------------------
def find_class(symbol: str, timeframe: str, class_code: str, version: int = 1) -> dict | None:
    try:
        res = (
            _get()
            .table("classes")
            .select("*")
            .eq("symbol", symbol)
            .eq("timeframe", timeframe)
            .eq("class_code", class_code)
            .eq("definition_version", version)
            .maybe_single()
            .execute()
        )
        return _maybe_row(res)
    except Exception as e:
        log.warning("find_class failed: %s", e)
        return None


def create_class(payload: dict) -> dict | None:
    try:
        res = (
            _get()
            .table("classes")
            .insert(payload)
            .execute()
        )
        return _first_row(res)
    except Exception as e:
        log.error("create_class failed: %s", e)
        return None


def touch_class(class_id: str) -> None:
    """Increment occurrences and update last_seen."""
    try:
        existing = (
            _get()
            .table("classes")
            .select("occurrences")
            .eq("id", class_id)
            .maybe_single()
            .execute()
        )
        row = _maybe_row(existing)
        if row:
            new_count = (row.get("occurrences") or 0) + 1
            (
                _get()
                .table("classes")
                .update({
                    "occurrences": new_count,
                    "last_seen": _now_iso(),
                })
                .eq("id", class_id)
                .execute()
            )
    except Exception as e:
        log.warning("touch_class failed: %s", e)


def upsert_signal(payload: dict) -> dict | None:
    try:
        res = (
            _get()
            .table("signals")
            .upsert(payload, on_conflict="signal_code")
            .execute()
        )
        return _first_row(res)
    except Exception as e:
        log.error("upsert_signal failed: %s", e)
        return None


def insert_observation(payload: dict) -> dict | None:
    try:
        res = (
            _get()
            .table("observations")
            .insert(payload)
            .execute()
        )
        return _first_row(res)
    except Exception as e:
        log.error("insert_observation failed: %s", e)
        return None


def upsert_condition_stat(payload: dict) -> None:
    try:
        (
            _get()
            .table("condition_stats")
            .upsert(payload, on_conflict="condition_key,class_id,direction")
            .execute()
        )
    except Exception as e:
        log.warning("upsert_condition_stat failed: %s", e)


def upsert_combination_stat(payload: dict) -> None:
    try:
        (
            _get()
            .table("combination_stats")
            .upsert(payload, on_conflict="combo_key,class_id,direction")
            .execute()
        )
    except Exception as e:
        log.warning("upsert_combination_stat failed: %s", e)


# ------------------------------------------------------------
# OPEN EXPERIMENTS
# ------------------------------------------------------------
def insert_open_experiment(payload: dict) -> dict | None:
    try:
        res = (
            _get()
            .table("open_experiments")
            .insert(payload)
            .execute()
        )
        return _first_row(res)
    except Exception as e:
        log.error("insert_open_experiment failed: %s", e)
        return None


def list_open_experiments(expired_only: bool = False) -> list[dict]:
    try:
        q = (
            _get()
            .table("open_experiments")
            .select("*")
            .eq("status", "open")
        )
        if expired_only:
            q = q.lte("expires_at", _now_iso())
        res = q.execute()
        return res.data or []
    except Exception as e:
        log.warning("list_open_experiments failed: %s", e)
        return []


def close_open_experiment(
    experiment_id: str,
    favorable_pips: float,
    adverse_pips: float,
    observation_id: str | None = None,
) -> None:
    try:
        (
            _get()
            .table("open_experiments")
            .update({
                "status": "closed",
                "favorable_pips": favorable_pips,
                "adverse_pips": adverse_pips,
                "observation_id": observation_id,
                "updated_at": _now_iso(),
            })
            .eq("id", experiment_id)
            .execute()
        )
    except Exception as e:
        log.warning("close_open_experiment failed: %s", e)
