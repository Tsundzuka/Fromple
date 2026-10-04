# ============================================================
# src/redis_client.py
# ============================================================
# Thin wrapper around Upstash Redis (HTTP client). All keys
# written here are temporary pipeline state and expire via TTL.

import json
import logging
from typing import Any

from upstash_redis import Redis

from . import config

log = logging.getLogger(__name__)

_redis: Redis | None = None


def _get() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis(
            url=config.UPSTASH_REDIS_REST_URL,
            token=config.UPSTASH_REDIS_REST_TOKEN,
        )
    return _redis


# ------------------------------------------------------------
# Key naming conventions
# ------------------------------------------------------------
def bars_key(symbol: str, timeframe: str) -> str:
    return f"run:{symbol}:{timeframe}:bars"


def indicators_key(symbol: str, timeframe: str) -> str:
    return f"run:{symbol}:{timeframe}:indicators"


def conditions_key(symbol: str, timeframe: str) -> str:
    return f"run:{symbol}:{timeframe}:conditions"


def control_key(name: str) -> str:
    return f"control:{name}"


# ------------------------------------------------------------
# Generic set/get with JSON serialisation
# ------------------------------------------------------------
def set_json(key: str, value: Any, ttl: int = config.REDIS_TTL_LONG) -> None:
    try:
        _get().set(key, json.dumps(value), ex=ttl)
    except Exception as e:
        log.warning("redis set_json(%s) failed: %s", key, e)


def get_json(key: str) -> Any | None:
    try:
        raw = _get().get(key)
        if raw is None:
            return None
        if isinstance(raw, (dict, list)):
            return raw
        return json.loads(raw)
    except Exception as e:
        log.warning("redis get_json(%s) failed: %s", key, e)
        return None


def delete(key: str) -> None:
    try:
        _get().delete(key)
    except Exception as e:
        log.warning("redis delete(%s) failed: %s", key, e)


# ------------------------------------------------------------
# Specific helpers (thin, expressive, used by pipeline scripts)
# ------------------------------------------------------------
def save_bars(symbol: str, timeframe: str, bars: list[dict]) -> None:
    set_json(bars_key(symbol, timeframe), bars)


def load_bars(symbol: str, timeframe: str) -> list[dict]:
    return get_json(bars_key(symbol, timeframe)) or []


def save_indicators(symbol: str, timeframe: str, indicators: dict) -> None:
    set_json(indicators_key(symbol, timeframe), indicators)


def load_indicators(symbol: str, timeframe: str) -> dict:
    return get_json(indicators_key(symbol, timeframe)) or {}


def save_conditions(symbol: str, timeframe: str, conditions: dict) -> None:
    set_json(conditions_key(symbol, timeframe), conditions)


def load_conditions(symbol: str, timeframe: str) -> dict:
    return get_json(conditions_key(symbol, timeframe)) or {}


def set_control(name: str, value: Any) -> None:
    set_json(control_key(name), value, ttl=config.REDIS_TTL_SHORT)


def get_control(name: str) -> Any | None:
    return get_json(control_key(name))
