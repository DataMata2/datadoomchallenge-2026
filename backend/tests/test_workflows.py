"""Synthetic workflow tests: no provider requests or real source mutations."""

import copy
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from cqa.config import Settings
from cqa.main import create_app
from cqa.provider import ModelReply
from cqa.rubric import default_checklist


class DynamicClient:
    model = "synthetic-workflow-model"

    def __init__(self):
        self.checklists = []

    def generate(self, system, prompt, schema, purpose):
        checklist = json.loads(prompt)["checklist"]
        self.checklists.append(checklist)
        values = {"contact": True, "discovery": None, "identification": None,
                  "consultation": 15, "empathy": True, "dialogue": 7,
                  "closure": True, "critical": False}
        judgments = [{"criterion_id": c["id"],
                      "value": values.get(c["id"], True if c["answer_type"] == "boolean" else max(c["allowed_values"])),
                      "rationale": "Synthetic checked region.", "evidence_turns": [1, 3]}
                     for c in checklist["criteria"]]
        return ModelReply(parsed={"criteria": judgments}, model=self.model, raw_usage={},
                          latency_ms=1, attempt_id="synthetic-attempt", cost_usd=0)


@pytest.fixture
def workflow(tmp_path, envelope):
    model = DynamicClient()
    app = create_app(Settings(database_path=tmp_path / "workflows.db"), model_client=model)
    with TestClient(app) as client:
        assert client.post("/api/datasets/import", json={"group_id": "DEV", "payload": envelope}).status_code == 200
        yield app, client, model


def evaluate(app, client, checklist_id="cqa-v1"):
    response = client.post("/api/runs", json={"dataset_id": "DEV", "conversation_ids": ["fiction-001"], "checklist_version_id": checklist_id})
    assert response.status_code == 202
    app.state.jobs.wait(response.json()["id"])
    run = client.get("/api/runs/" + response.json()["id"]).json()
    assert run["status"] == "completed"
    return client.get("/api/evaluations/" + run["items"][0]["evaluation_id"]).json()


def new_checklist(client, criteria=None):
    return client.post("/api/checklists", json={"name": "Synthetic revision", "parent_version_id": "cqa-v1",
                       "criteria": criteria if criteria is not None else default_checklist()["criteria"]})


def appeal(client, evaluation, criterion="consultation"):
    response = client.post("/api/appeals", json={"evaluation_id": evaluation["id"], "criterion_id": criterion, "comment": "Please review the cited region."})
    assert response.status_code == 201
    return response.json()


def test_new_versions_are_immutable_and_changed_criterion_reaches_evaluator(workflow):
    app, client, model = workflow
    baseline = client.get("/api/checklists/cqa-v1").json()
    criteria = copy.deepcopy(baseline["criteria"])
    criteria[0].update(id="custom_greeting", description="Check the operator's explicit custom greeting.", weight=25)
    created = new_checklist(client, criteria)
    assert created.status_code == 201
    version = created.json()
    assert version["id"] != "cqa-v1" and version["parent_version_id"] == "cqa-v1"
    result = evaluate(app, client, version["id"])
    assert model.checklists[-1] == version == result["checklist_snapshot"]
    assert result["final"]["criteria"][0]["criterion_id"] == "custom_greeting"
    assert result["final"]["criteria"][0]["weight"] == 25
    assert client.get("/api/checklists/cqa-v1").json() == baseline
    assert client.get("/api/checklists").json()["total"] == 2
    assert client.put("/api/checklists/" + version["id"], json=baseline).status_code == 405


@pytest.mark.parametrize("mutation", ["duplicate_id", "blank_id", "invalid_id", "negative_weight", "boolean_weight", "zero_weights", "duplicate_steps", "duplicate_booleans", "boolean_scale", "bad_boolean_steps", "missing_na_condition", "blank_na_condition", "unexpected_na_condition", "critical_weight", "critical_na", "blank_title", "blank_description", "no_criteria", "unbounded_weight", "unbounded_scale"])
def test_invalid_checklist_is_rejected_atomically(workflow, mutation):
    app, client, model = workflow
    criteria = default_checklist()["criteria"]
    if mutation == "duplicate_id": criteria[1]["id"] = criteria[0]["id"]
    if mutation == "blank_id": criteria[0]["id"] = " "
    if mutation == "invalid_id": criteria[0]["id"] = "invalid criterion id"
    if mutation == "negative_weight": criteria[0]["weight"] = -1
    if mutation == "boolean_weight": criteria[0]["weight"] = True
    if mutation == "zero_weights":
        for c in criteria: c["weight"] = 0
    if mutation == "duplicate_steps": criteria[3]["allowed_values"] = [0, 5, 5, 20]
    if mutation == "duplicate_booleans": criteria[0]["allowed_values"] = [False, True, True]
    if mutation == "boolean_scale": criteria[3]["allowed_values"] = [False, 20]
    if mutation == "bad_boolean_steps": criteria[0]["allowed_values"] = [0, 1]
    if mutation == "missing_na_condition": criteria[1]["na_condition"] = None
    if mutation == "blank_na_condition": criteria[1]["na_condition"] = "  "
    if mutation == "unexpected_na_condition": criteria[0]["na_condition"] = "Some condition"
    if mutation == "critical_weight": criteria[-1]["weight"] = 1
    if mutation == "critical_na": criteria[-1].update(allow_na=True, na_condition="Some condition")
    if mutation == "blank_title": criteria[0]["title"] = " "
    if mutation == "blank_description": criteria[0]["description"] = " "
    if mutation == "no_criteria": criteria = []
    if mutation == "unbounded_weight": criteria[0]["weight"] = 10**400
    if mutation == "unbounded_scale": criteria[3]["allowed_values"] = [0, 10**400]
    response = new_checklist(client, criteria)
    assert response.status_code == 422, response.text
    assert client.get("/api/checklists").json()["total"] == 1
    assert model.checklists == []


def test_checklist_parent_and_strict_request_boundaries(workflow):
    _, client, _ = workflow
    body = {"name": "Synthetic", "criteria": default_checklist()["criteria"]}
    assert client.post("/api/checklists", json={**body, "parent_version_id": "missing"}).status_code == 404
    assert client.post("/api/checklists", json={**body, "id": "cqa-v1"}).status_code == 422
    assert client.post("/api/checklists", json={**body, "name": "  "}).status_code == 422
    assert client.post("/api/checklists", json=body).status_code == 201


def test_appeal_confirmation_history_and_original_immutability(workflow):
    app, client, _ = workflow
    evaluation = evaluate(app, client)
    source = app.state.store.list("conversations")
    created = appeal(client, evaluation)
    assert created["status"] == "open" and created["decision"] is None
    assert client.get("/api/appeals", params={"evaluation_id": evaluation["id"]}).json() == {"items": [created], "total": 1}
    decision = client.post("/api/appeals/" + created["id"] + "/decision", json={"action": "confirm", "reason": "The cited assessment is supported."})
    assert decision.status_code == 200
    assert decision.json()["status"] == "confirmed"
    assert decision.json()["decision"]["value"] == 15
    after = client.get("/api/evaluations/" + evaluation["id"]).json()
    assert after["original"] == evaluation["original"] == after["final"]
    assert after["appeals"] == [decision.json()]
    assert app.state.store.list("conversations") == source


def test_change_uses_snapshot_after_another_version_and_recalculates(workflow):
    app, client, _ = workflow
    evaluation = evaluate(app, client)
    assert evaluation["final"]["final_score"] == 85.38
    criteria = default_checklist()["criteria"]
    criteria[3].update(allowed_values=[0, 1, 2], weight=99, scale_meanings={"0": "None", "1": "Partial", "2": "Full"})
    assert new_checklist(client, criteria).status_code == 201
    created = appeal(client, evaluation)
    decision = client.post("/api/appeals/" + created["id"] + "/decision", json={"action": "change", "value": 20, "reason": "The transcript supports full consultation credit."})
    assert decision.status_code == 200
    after = client.get("/api/evaluations/" + evaluation["id"]).json()
    assert after["original"] == evaluation["original"]
    assert after["checklist_snapshot"] == evaluation["checklist_snapshot"]
    assert after["final"]["final_score"] == 93.08
    assert after["final"]["criteria"][3]["value"] == 20
    assert after["final"]["criteria"][3]["rationale"] == decision.json()["decision"]["reason"]
    assert after["final"]["criteria"][3]["evidence_turns"] == [1, 3]


@pytest.mark.parametrize("body", [{"action": "change", "value": 6, "reason": "Wrong scale"}, {"action": "change", "value": True, "reason": "Wrong type"}, {"action": "change", "reason": "Missing value"}, {"action": "change", "value": None, "reason": "N/A prohibited"}, {"action": "confirm"}, {"action": "confirm", "reason": "  "}, {"action": "confirm", "value": 20, "reason": "Override attempt"}, {"action": "other", "reason": "Invalid action"}])
def test_invalid_decisions_leave_history_and_final_unchanged(workflow, body):
    app, client, _ = workflow
    evaluation = evaluate(app, client)
    # Consultation permits N/A; contact is the non-N/A boundary.
    created = appeal(client, evaluation, "contact" if "value" in body and body["value"] is None else "consultation")
    before = client.get("/api/evaluations/" + evaluation["id"]).json()
    response = client.post("/api/appeals/" + created["id"] + "/decision", json=body)
    assert response.status_code == 422, response.text
    assert client.get("/api/evaluations/" + evaluation["id"]).json() == before


def test_na_false_zero_and_critical_changes_are_distinct(workflow):
    app, client, _ = workflow
    evaluation = evaluate(app, client)
    for criterion, value in [("discovery", False), ("discovery", None), ("consultation", 0), ("critical", True)]:
        created = appeal(client, evaluation, criterion)
        response = client.post("/api/appeals/" + created["id"] + "/decision", json={"action": "change", "value": value, "reason": "Synthetic review of cited evidence."})
        assert response.status_code == 200
    after = client.get("/api/evaluations/" + evaluation["id"]).json()
    assert after["original"] == evaluation["original"]
    assert after["final"]["criteria"][1]["value"] is None
    assert type(after["final"]["criteria"][3]["value"]) is int
    assert after["final"]["final_score"] == 62.31
    assert after["final"]["critical_flag"] is True
    assert len(after["appeals"]) == 4


def test_concurrent_duplicate_decision_commits_only_one(workflow):
    app, client, _ = workflow
    evaluation = evaluate(app, client)
    created = appeal(client, evaluation)
    url = "/api/appeals/" + created["id"] + "/decision"
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda value: client.post(url, json={"action": "change", "value": value, "reason": "Synthetic review."}), [10, 20]))
    assert sorted(r.status_code for r in responses) == [200, 409]
    after = client.get("/api/evaluations/" + evaluation["id"]).json()
    assert len(after["appeals"]) == 1
    assert after["appeals"][0]["status"] == "changed"
    assert after["final"]["criteria"][3]["value"] == next(r for r in responses if r.status_code == 200).json()["decision"]["value"]


def test_recalculation_failure_rolls_back_decision_and_final(workflow, monkeypatch):
    import cqa.workflows as workflows
    app, client, _ = workflow
    evaluation = evaluate(app, client)
    created = appeal(client, evaluation)
    before = app.state.store.get("evaluations", evaluation["id"])
    def fail(*args):
        raise ValueError("Synthetic recalculation failure")
    monkeypatch.setattr(workflows, "score_criteria", fail)
    assert client.post("/api/appeals/" + created["id"] + "/decision", json={"action": "change", "value": 20, "reason": "Synthetic review."}).status_code == 422
    assert app.state.store.get("evaluations", evaluation["id"]) == before


def test_appeal_missing_failed_and_unknown_criterion_are_actionable(workflow):
    app, client, _ = workflow
    evaluation = evaluate(app, client)
    body = {"evaluation_id": evaluation["id"], "criterion_id": "missing", "comment": "Review"}
    assert client.post("/api/appeals", json=body).status_code == 422
    assert client.post("/api/appeals", json={**body, "evaluation_id": "missing"}).status_code == 404
    assert client.post("/api/appeals", json={**body, "criterion_id": "contact", "comment": " "}).status_code == 422
    assert client.post("/api/appeals/missing/decision", json={"action": "confirm", "reason": "Review"}).status_code == 404
    source = app.state.store.list("conversations")[0]
    failure = app.state.evaluator.failure(source, default_checklist(), "synthetic-failure", "Synthetic failure")
    assert client.post("/api/appeals", json={**body, "evaluation_id": failure["id"], "criterion_id": "contact"}).status_code == 422
