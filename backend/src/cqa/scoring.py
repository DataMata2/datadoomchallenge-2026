"""Validate model judgments and compute quality scores deterministically."""

from decimal import Decimal, ROUND_HALF_UP
from math import isfinite

from .models import CriterionJudgment


def _numeric(value) -> bool:
    return type(value) is int or (type(value) is float and isfinite(value))


def score_criteria(definitions: list[dict], judgments: list[dict], turn_count: int) -> dict:
    if type(turn_count) is not int or turn_count < 1:
        raise ValueError("turn_count must be a positive integer")
    ids = [definition["id"] for definition in definitions]
    if len(set(ids)) != len(ids) or not ids:
        raise ValueError("Criterion definitions must have unique IDs")
    rows = [CriterionJudgment.model_validate(row).model_dump() for row in judgments]
    row_ids = [row["criterion_id"] for row in rows]
    if len(set(row_ids)) != len(row_ids) or set(row_ids) != set(ids):
        raise ValueError("Each defined criterion must appear exactly once")
    by_id = {row["criterion_id"]: row for row in rows}
    criteria, earned, applicable = [], Decimal(0), Decimal(0)
    critical_flag = False
    for definition in definitions:
        row = by_id[definition["id"]]
        value, evidence = row["value"], row["evidence_turns"]
        if any(index < 1 or index > turn_count for index in evidence) or len(set(evidence)) != len(evidence):
            raise ValueError("Evidence indices must be unique and refer to existing one-based source turns")
        weight = definition["weight"]
        if not _numeric(weight) or weight < 0:
            raise ValueError("Criterion weights must be finite nonnegative numbers")
        allowed = definition["allowed_values"]
        answer_type = definition["answer_type"]
        if answer_type == "boolean":
            if any(type(step) is not bool for step in allowed) or set(allowed) != {False, True}:
                raise ValueError("Boolean criteria must allow false and true")
        elif answer_type == "scale":
            if not allowed or any(not _numeric(step) or step < 0 for step in allowed) or max(allowed) <= 0 or len(set(allowed)) != len(allowed):
                raise ValueError("Numeric scales must have unique nonnegative steps and a positive maximum")
        else:
            raise ValueError("Unsupported criterion answer type")
        if value is None:
            if not definition["allow_na"] or not definition.get("na_condition"):
                raise ValueError("N/A is not permitted for this criterion")
            normalized, points = None, None
        else:
            valid = type(value) is bool if answer_type == "boolean" else _numeric(value)
            if not valid or value not in allowed:
                raise ValueError("Criterion value must match its strict answer type and an allowed scale step")
            normalized = Decimal(int(value)) if answer_type == "boolean" else Decimal(str(value)) / Decimal(str(max(allowed)))
            points = Decimal(str(weight)) * normalized
            if not definition.get("critical", False):
                applicable += Decimal(str(weight))
                earned += points
        if definition.get("critical", False):
            if answer_type != "boolean" or value is None or weight != 0:
                raise ValueError("Critical criteria must be unscored non-null booleans")
            critical_flag = critical_flag or value
        criteria.append({**row, "weight": weight, "applicable": value is not None,
                         "normalized_value": float(normalized) if normalized is not None else None,
                         "points": float(points) if points is not None else None})
    final = (100 * earned / applicable).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if applicable else None
    for row in criteria:
        row["weighted_score"] = float(Decimal(str(row["points"])) * 100 / applicable) if row["points"] is not None and applicable else None
    return {"criteria": criteria, "earned_points": float(earned), "applicable_weight": float(applicable),
            "final_score": float(final) if final is not None else None, "critical_flag": critical_flag}
