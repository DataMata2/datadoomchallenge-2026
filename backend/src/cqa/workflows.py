"""Immutable checklist versions and atomic documented review of final values."""

from copy import deepcopy
from uuid import uuid4

from .budget import now
from .datasets import conversation_key
from .models import AppealRequest, ChecklistCreateRequest, DecisionRequest
from .rubric import default_checklist
from .scoring import score_criteria
from .storage import Store


class ReviewConflict(ValueError):
    """The appeal has already received a terminal decision."""


class Workflows:
    def __init__(self, store: Store):
        self.store = store

    def create_checklist(self, request: ChecklistCreateRequest) -> dict:
        parent = self.store.get("checklists", request.parent_version_id) if request.parent_version_id else default_checklist()
        if parent is None:
            raise KeyError("Parent checklist version not found")
        version = {"id": "cqa-" + str(uuid4()), "name": request.name,
                   "parent_version_id": request.parent_version_id, "instructions": parent["instructions"],
                   "criteria": [c.model_dump() for c in request.criteria]}
        self.store.insert_immutable("checklists", {version["id"]: version})
        return version

    @staticmethod
    def _reviewable(evaluation: dict, criterion_id: str) -> None:
        if evaluation["status"] != "ok" or evaluation["original"] is None or evaluation["final"] is None:
            raise ValueError("Only a successful evaluated criterion can be appealed; explicitly retry failed evaluations")
        if criterion_id not in {c["id"] for c in evaluation["checklist_snapshot"]["criteria"]}:
            raise ValueError("Criterion does not exist in the evaluation's immutable checklist snapshot")

    def create_appeal(self, request: AppealRequest) -> dict:
        created = {"id": str(uuid4()), "evaluation_id": request.evaluation_id,
                   "criterion_id": request.criterion_id, "comment": request.comment,
                   "status": "open", "created_at": now(), "decision": None}
        def append(evaluation):
            self._reviewable(evaluation, request.criterion_id)
            evaluation["appeals"].append(created)
            return evaluation
        try:
            self.store.update("evaluations", request.evaluation_id, append)
        except KeyError:
            raise KeyError("Evaluation not found") from None
        return created

    def appeals(self, evaluation_id: str | None = None) -> list[dict]:
        rows = [appeal for evaluation in self.store.list("evaluations")
                if evaluation_id is None or evaluation["id"] == evaluation_id
                for appeal in evaluation["appeals"]]
        return sorted(rows, key=lambda row: (row["created_at"], row["id"]))

    def decide(self, appeal_id: str, request: DecisionRequest) -> dict:
        appeal = next((row for row in self.appeals() if row["id"] == appeal_id), None)
        if appeal is None:
            raise KeyError("Appeal not found")
        evaluation = self.store.get("evaluations", appeal["evaluation_id"])
        source = self.store.get("conversations", conversation_key(evaluation["dataset_id"], evaluation["conversation_id"]))
        if source is None:
            raise ValueError("Original source conversation is missing; restore it before reviewing")
        def apply(current):
            # Recheck state under BEGIN IMMEDIATE: two concurrent decisions cannot both commit.
            target = next(row for row in current["appeals"] if row["id"] == appeal_id)
            if target["status"] != "open" or target["decision"] is not None:
                raise ReviewConflict("Appeal already decided; create a new appeal for another review")
            self._reviewable(current, target["criterion_id"])
            rows = [{key: deepcopy(row[key]) for key in ("criterion_id", "value", "rationale", "evidence_turns")}
                    for row in current["final"]["criteria"]]
            judgment = next(row for row in rows if row["criterion_id"] == target["criterion_id"])
            if request.action == "change":
                judgment.update(value=request.value, rationale=request.reason)
                # Use the evaluated snapshot, never the newest checklist. Evidence keeps source indices.
                current["final"] = score_criteria(current["checklist_snapshot"]["criteria"], rows, len(source["transcript"]))
            target.update(status="confirmed" if request.action == "confirm" else "changed",
                          decision={"action": request.action, "value": judgment["value"],
                                    "reason": request.reason, "created_at": now()})
            return current
        saved = self.store.update("evaluations", appeal["evaluation_id"], apply)
        return next(row for row in saved["appeals"] if row["id"] == appeal_id)
