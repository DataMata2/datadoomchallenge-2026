"""Exact schema 1.0 exports from synthetic DEV/control fixtures."""

import copy

import pytest
from fastapi.testclient import TestClient

from cqa.config import Settings
from cqa.datasets import import_dataset
from cqa.main import create_app
from cqa.rubric import default_checklist
from test_workflows import DynamicClient


@pytest.fixture
def export_app(tmp_path):
    app = create_app(Settings(database_path=tmp_path / "exports.db"), model_client=DynamicClient())
    with TestClient(app) as client:
        yield app, client


def prepare(app, envelope, dataset="DEV", count=1, failed=()):
    payload = copy.deepcopy(envelope)
    record = payload["data"]["records"][0]
    payload["data"].update(dataset_group_id=dataset, total_records=count,
        records=[{**copy.deepcopy(record), "conversation_id": f"{dataset}-fiction-{i:03}"} for i in range(count)])
    import_dataset(app.state.store, payload, dataset)
    rows = [row for row in app.state.store.list("conversations") if row["dataset_id"] == dataset]
    evaluations = []
    for index, row in enumerate(rows):
        if index in failed:
            evaluation = app.state.evaluator.failure(row, default_checklist(), "synthetic-run", "Synthetic provider failure; explicitly retry")
        else:
            evaluation = app.state.evaluator.evaluate(row, default_checklist(), "synthetic-run")
        evaluations.append(evaluation)
    return rows, evaluations


def get_export(client, dataset="DEV", **params):
    return client.get("/api/exports/" + dataset, params={"team_name": "SYNTHETIC TEST METADATA", **params})


@pytest.mark.parametrize("dataset,count", [("DEV", 65), ("CONTROL", 10)])
def test_complete_dev_and_ten_control_exports_keep_exact_ids_and_arithmetic(export_app, envelope, dataset, count):
    app, client = export_app
    source, evaluations = prepare(app, envelope, dataset, count)
    response = get_export(client, dataset)
    assert response.status_code == 200, response.text
    result = response.json()
    assert set(result) == {"schema_version", "team_name", "model", "results"}
    assert result["schema_version"] == "1.0"
    assert result["model"] == {"mode": "external_api", "name": "synthetic-workflow-model"}
    assert len(result["results"]) == count
    assert [r["conversation_id"] for r in result["results"]] == [r["conversation_id"] for r in source]
    baseline_ids = [c["id"] for c in default_checklist()["criteria"]]
    for row in result["results"]:
        assert set(row) == {"conversation_id", "status", "criteria", "score"}
        assert [c["criterion_id"] for c in row["criteria"]] == baseline_ids
        assert all(set(c) == {"criterion_id", "value", "rationale", "evidence_turns"} for c in row["criteria"])
        assert row["score"] == {"final_score": 85.38, "critical_flag": False}
        assert row["criteria"][1]["value"] is None
        assert row["criteria"][-1]["value"] is False
        assert row["criteria"][5]["value"] == 7
    assert evaluations[0]["original"]["earned_points"] == 55.5
    assert evaluations[0]["original"]["applicable_weight"] == 65
    assert evaluations[0]["original"]["criteria"][5]["points"] == 10.5


def test_failed_items_keep_id_empty_criteria_null_score_and_reason(export_app, envelope):
    app, client = export_app
    source, _ = prepare(app, envelope, count=3, failed=(1,))
    response = get_export(client)
    assert response.status_code == 200
    rows = response.json()["results"]
    assert rows[1] == {"conversation_id": source[1]["conversation_id"], "status": "error", "criteria": [], "score": None,
                       "error": "Synthetic provider failure; explicitly retry"}
    assert len(rows) == 3


def test_export_uses_final_reviews_and_distinguishes_na_false_zero_and_critical(export_app, envelope):
    app, client = export_app
    source, evaluations = prepare(app, envelope)
    evaluation = evaluations[0]
    for criterion, value in [("contact", False), ("consultation", 0), ("critical", True)]:
        appeal = client.post("/api/appeals", json={"evaluation_id": evaluation["id"], "criterion_id": criterion, "comment": "Synthetic appeal."})
        assert appeal.status_code == 201
        assert client.post("/api/appeals/" + appeal.json()["id"] + "/decision", json={"action": "change", "value": value, "reason": "Synthetic reviewed evidence."}).status_code == 200
    exported = get_export(client).json()["results"][0]
    assert exported["criteria"][0]["value"] is False
    assert exported["criteria"][1]["value"] is None
    assert type(exported["criteria"][3]["value"]) is int and exported["criteria"][3]["value"] == 0
    assert exported["criteria"][-1]["value"] is True
    assert exported["score"] == {"final_score": 46.92, "critical_flag": True}
    assert app.state.store.get("evaluations", evaluation["id"])["original"] == evaluation["original"]
    assert app.state.store.list("conversations") == source


def test_unevaluated_dataset_and_metadata_fail_explicitly(export_app, envelope):
    app, client = export_app
    import_dataset(app.state.store, envelope, "DEV")
    response = get_export(client)
    assert response.status_code == 422
    assert "unevaluated" in response.json()["detail"].lower()
    assert get_export(client, "missing").status_code == 404
    assert client.get("/api/exports/DEV").status_code == 422
    assert get_export(client, team_name="  ").status_code == 422


def test_nonbaseline_export_is_actionable_and_never_falls_back(export_app, envelope):
    app, client = export_app
    prepare(app, envelope)
    criteria = default_checklist()["criteria"]
    criteria[0]["id"] = "replacement"
    changed = client.post("/api/checklists", json={"name": "Synthetic version", "criteria": criteria}).json()
    response = get_export(client, checklist_version_id=changed["id"])
    assert response.status_code == 422
    assert "cqa-v1" in response.json()["detail"] and "evaluate" in response.json()["detail"].lower()
    assert get_export(client, checklist_version_id="missing").status_code == 404


@pytest.mark.parametrize("mutation", ["duplicate_record", "missing_record", "unknown_record", "duplicate_criterion", "missing_criterion", "bool_as_zero", "wrong_step", "missing_evidence", "outside_evidence", "wrong_total", "wrong_critical", "unrounded_total", "extra_field", "empty_reason"])
def test_export_validation_rejects_incomplete_or_invalid_artifacts(export_app, envelope, mutation):
    from cqa.exports import validate_baseline_export
    app, client = export_app
    source, _ = prepare(app, envelope, count=2, failed=(1,))
    document = get_export(client).json()
    if mutation == "duplicate_record": document["results"].append(copy.deepcopy(document["results"][0]))
    if mutation == "missing_record": document["results"].pop()
    if mutation == "unknown_record": document["results"][0]["conversation_id"] = "unknown"
    if mutation == "duplicate_criterion": document["results"][0]["criteria"][-1] = document["results"][0]["criteria"][0]
    if mutation == "missing_criterion": document["results"][0]["criteria"].pop()
    if mutation == "bool_as_zero": document["results"][0]["criteria"][-1]["value"] = 0
    if mutation == "wrong_step": document["results"][0]["criteria"][3]["value"] = 6
    if mutation == "missing_evidence": document["results"][0]["criteria"][0]["evidence_turns"] = []
    if mutation == "outside_evidence": document["results"][0]["criteria"][0]["evidence_turns"] = [4]
    if mutation == "wrong_total": document["results"][0]["score"]["final_score"] = 85.39
    if mutation == "wrong_critical": document["results"][0]["score"]["critical_flag"] = True
    if mutation == "unrounded_total": document["results"][0]["score"]["final_score"] = 85.38001
    if mutation == "extra_field": document["results"][0]["transcript"] = []
    if mutation == "empty_reason": document["results"][1]["error"] = "  "
    with pytest.raises(ValueError):
        validate_baseline_export(document, source)


def test_validation_rejects_duplicate_source_ids(export_app, envelope):
    from cqa.exports import validate_baseline_export
    app, client = export_app
    source, _ = prepare(app, envelope)
    with pytest.raises(ValueError, match="source"):
        validate_baseline_export(get_export(client).json(), source + source)


def test_latest_failure_is_preserved_instead_of_older_success(export_app, envelope):
    app, client = export_app
    source, _ = prepare(app, envelope)
    app.state.evaluator.failure(source[0], default_checklist(), "new-synthetic-run", "Synthetic latest failure")
    response = get_export(client)
    assert response.status_code == 200
    assert response.json()["results"][0]["error"] == "Synthetic latest failure"


def test_export_rejects_mixed_model_identity(export_app, envelope):
    app, client = export_app
    source, _ = prepare(app, envelope)
    app.state.evaluator.failure(source[0], default_checklist(), "new-synthetic-run", "Synthetic failure", model="other-synthetic-model")
    # A second source has another actual model identity; a single header cannot represent both.
    payload = copy.deepcopy(envelope)
    payload["data"]["records"][0]["conversation_id"] = "second-fiction"
    import_dataset(app.state.store, payload, "DEV")
    second = next(r for r in app.state.store.list("conversations") if r["conversation_id"] == "second-fiction")
    app.state.evaluator.evaluate(second, default_checklist(), "new-synthetic-run")
    response = get_export(client)
    assert response.status_code == 422
    assert "model" in response.json()["detail"].lower()


def test_export_rejects_corrupt_stored_score_instead_of_silently_fixing(export_app, envelope):
    app, client = export_app
    _, evaluations = prepare(app, envelope)
    def corrupt(evaluation):
        evaluation["final"]["final_score"] = 0
        return evaluation
    app.state.store.update("evaluations", evaluations[0]["id"], corrupt)
    assert get_export(client).status_code == 422
