# ============================================================
# src/supabase_client.py
# ============================================================
# Thin wrapper around supabase-py. Every method is scoped to a
# specific pipeline need — no generic query builder leaks out.

import logging
from datetime import datetime, timezone
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
        return bool(res.data and res.data.get("is_running"))
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
                "last_successful_run": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
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
        return res.data.get("value") if res.data else None
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
                    "updated_at": datetime.now(timezone.utc).isoformat(),
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

        if res.data:
            new_used = (res.data.get("used") or 0) + by
            (
                _get()
                .table("api_usage")
                .update({
                    "used": new_used,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
                .eq("id", res.data["id"])
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
        return res.data if res else None
    except Exception as e:
        log.warning("find_class failed: %s", e)
        return None


def create_class(payload: dict) -> dict | None:
    try:
        res = (
            _get()
            .table("classes")
            .insert(payload)
            .select("*")
            .single()
            .execute()
        )
        return res.data
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
        if existing.data:
            new_count = (existing.data.get("occurrences") or 0) + 1
            (
                _get()
                .table("classes")
                .update({
                    "occurrences": new_count,
                    "last_seen": datetime.now(timezone.utc).isoformat(),
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
            .select("*")
            .single()
            .execute()
        )
        return res.data
    except Exception as e:
        log.error("upsert_signal failed: %s", e)
        return None


def insert_observation(payload: dict) -> dict | None:
    try:
        res = (
            _get()
            .table("observations")
            .insert(payload)
            .select("*")
            .single()
            .execute()
        )
        return res.data
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
            .select("*")
            .single()
            .execute()
        )
        return res.data
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
            q = q.lte("expires_at", datetime.now(timezone.utc).isoformat())
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
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", experiment_id)
            .execute()
        )
    except Exception as e:
        log.warning("close_open_experiment failed: %s", e)
