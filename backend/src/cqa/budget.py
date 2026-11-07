"""Atomic durable reservations and measured provider usage in one ledger document."""

import json
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from .storage import Store


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def decimal(value) -> Decimal:
    return Decimal(str(value))


def usd(value) -> float:
    return float(decimal(value).quantize(Decimal("0.00000001")))


class BudgetExceeded(ValueError):
    pass


class Budget:
    def __init__(self, store: Store, *, hard_limit: float = 100, working_limit: float = 80):
        if not 0 < working_limit <= hard_limit <= 100:
            raise ValueError("Budget limits must satisfy 0 < working <= hard <= USD 100")
        self.store = store
        # INSERT OR IGNORE, rather than upsert: reopening must retain every reservation.
        with store._connection(write=True) as connection:
            connection.execute("INSERT OR IGNORE INTO documents VALUES (?, ?, ?)",
                ("usage", "ledger", json.dumps({"hard_limit_usd": hard_limit, "working_limit_usd": working_limit, "attempts": {}})))

    def reserve(self, *, model: str, purpose: str, amount: float, run_id: str | None = None,
                rates: dict | None = None, allowance: str = "working", max_tokens: int | None = None) -> str:
        if allowance not in {"working", "control"} or not decimal(amount).is_finite() or decimal(amount) <= 0:
            raise ValueError("A positive finite reservation and explicit allowance are required")
        id = str(uuid4())
        def reserve(ledger):
            committed = sum((decimal(row["cost_usd"] or 0) + decimal(row["reserved_usd"]) for row in ledger["attempts"].values()), Decimal(0))
            limit = ledger["hard_limit_usd"] if allowance == "control" else ledger["working_limit_usd"]
            if committed + decimal(amount) > decimal(limit):
                raise BudgetExceeded("Insufficient model allowance for a conservative reservation")
            ledger["attempts"][id] = {
                "id": id, "run_id": run_id, "purpose": purpose, "model": model, "status": "reserved",
                "started_at": now(), "finished_at": None, "latency_ms": None,
                "provider_request_id": None, "provider_message_id": None, "raw_usage": None,
                "input_tokens": None, "output_tokens": None, "cost_usd": None,
                "reserved_usd": usd(amount), "reservation_usd": usd(amount), "allowance": allowance,
                "max_tokens": max_tokens, "rates": rates or {}, "error": None,
                "stop_reason": None, "stop_details": None,
            }
            return ledger
        self.store.update("usage", "ledger", reserve)
        return id

    def finish(self, id: str, *, status: str, raw_usage: dict | None = None, cost: float | None = None, **fields) -> None:
        def finish(ledger):
            row = ledger["attempts"][id]
            row.update(fields)
            row.update(status=status, finished_at=now())
            if raw_usage is not None:
                row.update(raw_usage=raw_usage, input_tokens=raw_usage.get("input_tokens"), output_tokens=raw_usage.get("output_tokens"))
            if cost is not None:
                if not decimal(cost).is_finite() or decimal(cost) < 0:
                    raise ValueError("Measured cost must be finite and nonnegative")
                row.update(cost_usd=usd(cost), reserved_usd=0)
            # Unknown outcomes deliberately retain the full outstanding reservation.
            return ledger
        self.store.update("usage", "ledger", finish)

    def invalidate(self, id: str, error: str) -> None:
        self.finish(id, status="invalid_output", error=error)

    def summary(self) -> dict:
        ledger = self.store.get("usage", "ledger")
        attempts = sorted(ledger["attempts"].values(), key=lambda row: (row["started_at"], row["id"]))
        spent = sum((decimal(row["cost_usd"] or 0) for row in attempts), Decimal(0))
        reserved = sum((decimal(row["reserved_usd"]) for row in attempts), Decimal(0))
        return {"currency": "USD", "hard_limit_usd": ledger["hard_limit_usd"], "working_limit_usd": ledger["working_limit_usd"],
                "control_reserve_usd": usd(decimal(ledger["hard_limit_usd"]) - decimal(ledger["working_limit_usd"])),
                "spent_usd": usd(spent), "reserved_usd": usd(reserved),
                "remaining_usd": usd(max(Decimal(0), decimal(ledger["hard_limit_usd"]) - spent - reserved)),
                "working_remaining_usd": usd(max(Decimal(0), decimal(ledger["working_limit_usd"]) - spent - reserved)), "attempts": attempts}
