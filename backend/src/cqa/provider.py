"""Synchronous native structured JSON provider with one durable attempt per send."""

import json
import math
import threading
import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from decimal import Decimal
from typing import Callable

from anthropic import Anthropic, transform_schema
from jsonschema import Draft202012Validator

from .budget import Budget, usd
from .config import Settings, load_api_key

# One backend process. All model consumers share this gate, including future metrics.
MODEL_CALLS = threading.BoundedSemaphore(2)
_RUN: ContextVar[str | None] = ContextVar("provider_run", default=None)
_CANCEL: ContextVar[Callable[[], bool]] = ContextVar("provider_cancel", default=lambda: False)
SONNET_RATES = {"version": "claude-pricing-2026-11-07", "input_per_million": 2,
                "output_per_million": 10, "cache_read_per_million": .1,
                "cache_write_5m_per_million": 2.5, "cache_write_1h_per_million": 4,
                "source": "https://platform.claude.com/docs/en/models/sonnet-5-5/overview"}


@contextmanager
def provider_context(run_id: str, cancelled: Callable[[], bool]):
    run_token, cancel_token = _RUN.set(run_id), _CANCEL.set(cancelled)
    try:
        yield
    finally:
        _RUN.reset(run_token)
        _CANCEL.reset(cancel_token)


@dataclass(frozen=True)
class ModelReply:
    parsed: dict
    model: str
    raw_usage: dict
    latency_ms: int
    attempt_id: str
    cost_usd: float


class ProviderError(RuntimeError):
    def __init__(self, message: str, attempt_id: str | None = None):
        super().__init__(message)
        self.attempt_id = attempt_id


class CancelledBeforeSend(ProviderError):
    pass


def _dict(value) -> dict | None:
    if value is None or isinstance(value, dict):
        return value
    return value.model_dump(mode="json")


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON object field")
        result[key] = value
    return result


def _finite_float(text):
    value = float(text)
    if not math.isfinite(value):
        raise ValueError("Non-finite JSON number")
    return value


def usage_cost(usage: dict) -> float:
    """Standard uncached pricing; cache fields are accounted if unexpectedly returned."""
    for name in ("input_tokens", "output_tokens"):
        if type(usage.get(name)) is not int or usage[name] < 0:
            raise ValueError("Provider usage is missing valid token counts")
    for name in ("cache_creation_input_tokens", "cache_read_input_tokens"):
        value = usage.get(name)
        if value is not None and (type(value) is not int or value < 0):
            raise ValueError("Provider usage contains invalid cache token counts")
    cache = usage.get("cache_creation") or {}
    for value in cache.values():
        if type(value) is not int or value < 0:
            raise ValueError("Provider usage contains invalid cache lifetime counts")
    writes = usage.get("cache_creation_input_tokens") or 0
    hour = cache.get("ephemeral_1h_input_tokens") or 0
    five_min = cache.get("ephemeral_5m_input_tokens", writes - hour) or 0
    cost = (Decimal(usage["input_tokens"]) * 2 + Decimal(usage["output_tokens"]) * 10
            + Decimal(usage.get("cache_read_input_tokens") or 0) * Decimal("0.1")
            + Decimal(five_min) * Decimal("2.5") + Decimal(hour) * 4) / 1_000_000
    if any((usage.get("server_tool_use") or {}).values()) or usage.get("speed") == "fast" or usage.get("service_tier") not in {None, "standard"}:
        raise ValueError("Unexpected paid provider feature requires billing reconciliation")
    return usd(cost)


class ModelClient:
    def __init__(self, budget: Budget, *, settings: Settings | None = None, sdk=None):
        self.budget = budget
        self.settings = settings or Settings()
        self.model = self.settings.model
        if self.model != "claude-sonnet-5-5":
            raise ValueError("This provider requires verified rates/request settings for claude-sonnet-5-5")
        if not 1 <= self.settings.max_output_tokens <= 8192 or not 0 < self.settings.model_timeout_seconds <= 120:
            raise ValueError("Provider output limit must be 1..8192 and timeout at most 120 seconds")
        self._sdk = sdk
        self._sdk_lock = threading.Lock()

    @property
    def sdk(self):
        with self._sdk_lock:
            if self._sdk is None:
                self._sdk = Anthropic(api_key=load_api_key(self.settings.env_file), max_retries=0, timeout=self.settings.model_timeout_seconds)
            return self._sdk

    def generate(self, system: str, prompt: str, schema: dict, purpose: str) -> ModelReply:
        # Validate local schema/configuration before reserving or sending.
        Draft202012Validator.check_schema(schema)
        transmitted_schema = transform_schema(schema)
        sdk = self.sdk
        with MODEL_CALLS:
            if _CANCEL.get()():
                raise CancelledBeforeSend("Run cancelled before provider request")
            # Reserve the full documented 1M input window and bounded output.
            # No cache controls/tools are sent; standard input/output billing is expected.
            reserve = usd(Decimal(1_000_000) * 2 / 1_000_000 + Decimal(self.settings.max_output_tokens) * 10 / 1_000_000)
            attempt = self.budget.reserve(model=self.model, purpose=purpose, amount=reserve, run_id=_RUN.get(),
                                          rates=SONNET_RATES, max_tokens=self.settings.max_output_tokens,
                                          allowance=self.settings.model_allowance)
            if _CANCEL.get()():
                self.budget.finish(attempt, status="cancelled", cost=0, error="Cancelled before provider send")
                raise CancelledBeforeSend("Run cancelled before provider request", attempt)
            started = time.monotonic()
            try:
                response = sdk.messages.create(model=self.model, max_tokens=self.settings.max_output_tokens,
                    thinking={"type": "between_tools"}, system=system,
                    messages=[{"role": "user", "content": prompt}],
                    output_config={"effort": "medium", "format": {"type": "json_schema", "schema": transmitted_schema}})
            except Exception as error:
                latency = round((time.monotonic() - started) * 1000)
                code = getattr(error, "status_code", None)
                known_rejected = code is not None and 400 <= code < 500 and code not in {408, 499}
                reason = f"Provider rejected request (HTTP {code})" if known_rejected else "Provider request failed; paid outcome unknown; reservation retained"
                self.budget.finish(attempt, status="failed" if known_rejected else "unknown", cost=0 if known_rejected else None,
                    latency_ms=latency, provider_request_id=getattr(error, "request_id", None), error=reason)
                raise ProviderError(reason, attempt) from None
            latency = round((time.monotonic() - started) * 1000)
            usage = _dict(response.usage)
            details = _dict(getattr(response, "stop_details", None))
            metadata = {"latency_ms": latency, "provider_request_id": getattr(response, "_request_id", None),
                        "provider_message_id": response.id, "stop_reason": response.stop_reason, "stop_details": details}
            try:
                cost = usage_cost(usage)
                if response.model != self.model:
                    raise ValueError("Provider returned an unexpected model; billing requires reconciliation")
            except (ValueError, TypeError) as error:
                self.budget.finish(attempt, status="unknown", raw_usage=usage, error=str(error), **metadata)
                raise ProviderError(str(error), attempt) from None
            # Settle usage before any output parsing, including refusals and truncation.
            self.budget.finish(attempt, status="received", raw_usage=usage, cost=cost, **metadata)
            try:
                if response.stop_reason != "end_turn" or details:
                    raise ValueError("Provider refused, truncated, or did not finish the structured assessment")
                blocks = response.content
                if len(blocks) != 1 or blocks[0].type != "text":
                    raise ValueError("Provider did not return one structured text block")
                parsed = json.loads(blocks[0].text, object_pairs_hook=_unique_object, parse_float=_finite_float, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite JSON value")))
                if not isinstance(parsed, dict):
                    raise ValueError("Provider output must be a JSON object")
                Draft202012Validator(schema).validate(parsed)
            except Exception:
                reason = "Provider returned invalid structured output; inspect schema/stop metadata and explicitly retry if needed"
                self.budget.invalidate(attempt, reason)
                raise ProviderError(reason, attempt) from None
            self.budget.finish(attempt, status="succeeded")
            return ModelReply(parsed=parsed, model=response.model, raw_usage=usage, latency_ms=latency, attempt_id=attempt, cost_usd=cost)
