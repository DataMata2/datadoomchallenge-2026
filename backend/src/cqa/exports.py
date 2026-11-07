"""Validate and build the exact baseline-only submission contract."""

from .models import BaselineExport
from .rubric import default_checklist
from .scoring import score_criteria
from .storage import Store

BASELINE_VERSION = "cqa-v1"


def validate_baseline_export(document: dict, conversations: list[dict]) -> dict:
    """Validate schema, exact source population, evidence and independent arithmetic.

    This function has no persistence or provider side effects. Call it before
    writing an official file, using the complete selected dataset as conversations.
    """
    export = BaselineExport.model_validate(document).model_dump()
    if not export["model"]["name"].strip():
        raise ValueError("Export requires the actual nonempty model name")
    source_ids = [row["conversation_id"] for row in conversations]
    if len(set(source_ids)) != len(source_ids) or not source_ids:
        raise ValueError("Selected source dataset must contain nonempty unique conversation IDs")
    result_ids = [row["conversation_id"] for row in export["results"]]
    if len(set(result_ids)) != len(result_ids) or len(result_ids) != len(source_ids) or set(result_ids) != set(source_ids):
        raise ValueError("Export must contain every selected dataset conversation ID exactly once, without extras")
    by_id = {row["conversation_id"]: row for row in conversations}
    baseline = default_checklist()
    for record in export["results"]:
        if record["status"] == "error":
            if not record["error"].strip():
                raise ValueError("Failed records require a nonempty actionable error reason")
            continue
        computed = score_criteria(baseline["criteria"], record["criteria"], len(by_id[record["conversation_id"]]["transcript"]))
        if computed["final_score"] is None:
            raise ValueError("Successful baseline exports require a numeric final score")
        if record["score"] != {"final_score": computed["final_score"], "critical_flag": computed["critical_flag"]}:
            raise ValueError("Export score must equal the independently recalculated two-decimal total and separate critical flag")
    return export


def build_baseline_export(store: Store, jobs, dataset_id: str, team_name: str,
                          checklist_version_id: str = BASELINE_VERSION) -> dict:
    checklist = store.get("checklists", checklist_version_id)
    if checklist is None:
        raise KeyError("Checklist version not found")
    if checklist_version_id != BASELINE_VERSION or checklist != default_checklist():
        raise ValueError("Schema 1.0 requires the unchanged cqa-v1 baseline; evaluate the selected dataset with cqa-v1 before exporting. Custom versions remain available for separate analysis.")
    if not isinstance(team_name, str) or not team_name.strip():
        raise ValueError("Provide the official nonempty team_name explicitly")
    sources = sorted((row for row in store.list("conversations") if row["dataset_id"] == dataset_id),
                     key=lambda row: row["conversation_id"])
    if not sources:
        raise KeyError("Selected dataset is missing or empty; import it before exporting")
    results, identities = [], set()
    for source in sources:
        evaluation = jobs.latest_evaluation(dataset_id, source["conversation_id"], checklist_version_id)
        if evaluation is None:
            raise ValueError("Selected dataset contains unevaluated conversations; complete an explicit cqa-v1 evaluation run before exporting")
        if evaluation["checklist_snapshot"] != checklist:
            raise ValueError("Evaluation snapshot is incompatible with the cqa-v1 baseline; explicitly evaluate with the unchanged baseline before exporting")
        model = evaluation["model"]
        identities.add((model["mode"], model["name"]))
        if evaluation["status"] == "error":
            results.append({"conversation_id": source["conversation_id"], "status": "error", "criteria": [],
                            "score": None, "error": evaluation["error"]})
        else:
            final = evaluation["final"]
            if final is None:
                raise ValueError("Successful evaluation is missing its final assessment; repair or explicitly re-evaluate before exporting")
            criteria = [{key: row[key] for key in ("criterion_id", "value", "rationale", "evidence_turns")}
                        for row in final["criteria"]]
            results.append({"conversation_id": source["conversation_id"], "status": "ok", "criteria": criteria,
                            "score": {"final_score": final["final_score"], "critical_flag": final["critical_flag"]}})
    if len(identities) != 1:
        raise ValueError("Selected evaluations have multiple actual model identities; explicitly evaluate the dataset with one model before producing a single-model schema 1.0 export")
    mode, name = identities.pop()
    return validate_baseline_export({"schema_version": "1.0", "team_name": team_name,
                                    "model": {"mode": mode, "name": name}, "results": results}, sources)
