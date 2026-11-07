import copy
import threading

import pytest

from cqa.datasets import conversation_key, import_dataset
from cqa.evaluations import Evaluator
from cqa.jobs import JobManager
from cqa.provider import ModelReply
from cqa.rubric import default_checklist
from cqa.storage import Store


def judgments():
    return [{"criterion_id": c["id"], "value": False if c["answer_type"] == "boolean" else c["allowed_values"][-1],
             "rationale": "Synthetic checked region.", "evidence_turns": [1, 3]} for c in default_checklist()["criteria"]]


class FixtureClient:
    model = "fixture-model"
    def __init__(self, values=None):
        self.values = values if values is not None else judgments()
    def generate(self, system, prompt, schema, purpose):
        assert '"turn_index": 1' in prompt and '"turn_index": 3' in prompt
        assert "na_condition" in prompt and "scale_meanings" in prompt
        return ModelReply(parsed={"criteria": self.values}, model=self.model, raw_usage={}, latency_ms=1,
                          attempt_id="fixture-attempt", cost_usd=0)


def prepared(tmp_path, envelope, count=1):
    store = Store(tmp_path / "jobs.db")
    store.insert_immutable("checklists", {"cqa-v1": default_checklist()})
    original = envelope["data"]["records"][0]
    envelope["data"]["records"] = [{**copy.deepcopy(original), "conversation_id": f"fiction-{i}"} for i in range(count)]
    envelope["data"]["total_records"] = count
    import_dataset(store, envelope, "DEV")
    return store


@pytest.mark.parametrize("mutation", ["duplicate", "value", "evidence", "missing", "extra"])
def test_semantic_invalid_evaluation_is_durable_error_with_attempt(tmp_path, envelope, mutation):
    store = prepared(tmp_path, envelope)
    values = judgments()
    if mutation == "duplicate": values[-1] = copy.deepcopy(values[0])
    if mutation == "value": values[0]["value"] = 1
    if mutation == "evidence": values[0]["evidence_turns"] = [4]
    if mutation == "missing": values.pop()
    if mutation == "extra": values[0]["unexpected"] = True
    evaluator = Evaluator(store, FixtureClient(values))
    result = evaluator.evaluate(store.get("conversations", conversation_key("DEV", "fiction-0")), default_checklist(), "fixture-run")
    assert result["status"] == "error" and result["original"] is None and result["final"] is None
    assert result["usage_attempt_ids"] == ["fixture-attempt"]
    assert store.get("evaluations", result["id"]) == result


def test_mixed_run_retains_all_ids_and_reimport_does_not_conflict(tmp_path, envelope):
    store = prepared(tmp_path, envelope, 3)
    evaluator = Evaluator(store, FixtureClient())
    real = evaluator.evaluate
    def evaluate(row, checklist, run_id):
        if row["conversation_id"] == "fiction-1":
            raise RuntimeError("Synthetic execution failure")
        return real(row, checklist, run_id)
    evaluator.evaluate = evaluate
    manager = JobManager(store, evaluator)
    run = manager.start("DEV", [f"fiction-{i}" for i in range(3)], "cqa-v1")
    manager.wait(run["id"])
    final = manager.get(run["id"])
    assert final["status"] == "failed" and final["total"] == 3
    assert final["completed"] == 2 and final["failed"] == 1
    assert [item["conversation_id"] for item in final["items"]] == [f"fiction-{i}" for i in range(3)]
    assert manager.latest_evaluation("DEV", "fiction-0", "cqa-v1")["status"] == "ok"
    import_dataset(store, envelope, "DEV")
    assert store.get("conversations", conversation_key("DEV", "fiction-0")).get("evaluation_id") is None
    manager.close()


def test_cancellation_keeps_finished_work_and_stops_unsent_items(tmp_path, envelope):
    store = prepared(tmp_path, envelope, 5)
    entered, release = threading.Event(), threading.Event()
    evaluator = Evaluator(store, FixtureClient())
    real = evaluator.evaluate
    def evaluate(*args):
        entered.set()
        assert release.wait(5)
        return real(*args)
    evaluator.evaluate = evaluate
    manager = JobManager(store, evaluator)
    run = manager.start("DEV", [f"fiction-{i}" for i in range(5)], "cqa-v1")
    assert entered.wait(5)
    manager.cancel(run["id"])
    release.set()
    manager.wait(run["id"])
    final = manager.get(run["id"])
    assert final["status"] == "cancelled"
    assert 1 <= final["completed"] <= 2
    assert sum(item["status"] == "cancelled" for item in final["items"]) >= 3
    manager.close()


def test_restart_marks_incomplete_run_interrupted_without_resending(tmp_path, envelope):
    store = prepared(tmp_path, envelope)
    manager = JobManager(store, Evaluator(store, FixtureClient()))
    run = manager.start("DEV", ["fiction-0"], "cqa-v1", background=False)
    manager.close()
    resumed = JobManager(Store(store.path), Evaluator(store, FixtureClient()))
    resumed.startup()
    final = resumed.get(run["id"])
    assert final["status"] == "interrupted" and final["items"][0]["status"] == "interrupted"
    assert final["completed"] == 0
    assert store.list("evaluations") == []
    resumed.close()


def test_app_construction_and_openapi_leave_active_work_untouched(tmp_path, envelope):
    from cqa.config import Settings
    from cqa.main import create_app
    store = prepared(tmp_path, envelope)
    entered, release = threading.Event(), threading.Event()
    evaluator = Evaluator(store, FixtureClient())
    real = evaluator.evaluate
    def evaluate(*args):
        entered.set()
        assert release.wait(5)
        return real(*args)
    evaluator.evaluate = evaluate
    manager = JobManager(store, evaluator)
    run = manager.start("DEV", ["fiction-0"], "cqa-v1")
    assert entered.wait(5)
    app = create_app(Settings(database_path=store.path), model_client=FixtureClient())
    assert "/api/runs" in app.openapi()["paths"]
    assert manager.get(run["id"])["status"] == "running"
    assert store.list("evaluations") == []
    release.set()
    manager.wait(run["id"])
    assert manager.get(run["id"])["completed"] == 1
    assert len(store.list("evaluations")) == 1
    manager.close()
    app.state.jobs.close()


def test_restart_keeps_durable_completed_items_and_unknown_attempts(tmp_path, envelope):
    from cqa.budget import Budget
    store = prepared(tmp_path, envelope, 2)
    manager = JobManager(store, Evaluator(store, FixtureClient()))
    run = manager.start("DEV", ["fiction-0", "fiction-1"], "cqa-v1", background=False)
    evaluation = manager.evaluator.evaluate(store.get("conversations", conversation_key("DEV", "fiction-0")), default_checklist(), run["id"])
    budget = Budget(store)
    attempt = budget.reserve(model="fixture-model", purpose="evaluation", amount=2.1, run_id=run["id"])
    manager.close()
    client = FixtureClient()
    client.budget = budget
    resumed = JobManager(store, Evaluator(store, client))
    resumed.startup()
    final = resumed.get(run["id"])
    assert final["status"] == "interrupted" and final["completed"] == 1
    assert final["items"][0]["evaluation_id"] == evaluation["id"]
    assert final["items"][1]["status"] == "interrupted"
    assert budget.summary()["attempts"][0]["status"] == "unknown"
    assert budget.summary()["reserved_usd"] == 2.1
    resumed.close()


def test_evaluation_api_and_checklist_specific_latest_reference(tmp_path, envelope):
    from fastapi.testclient import TestClient
    from cqa.config import Settings
    from cqa.main import create_app
    app = create_app(Settings(database_path=tmp_path / "api.db"), model_client=FixtureClient())
    with TestClient(app) as client:
        client.post("/api/datasets/import", json={"group_id": "DEV", "payload": envelope})
        body = {"dataset_id": "DEV", "conversation_ids": ["fiction-001"], "checklist_version_id": "cqa-v1"}
        created = client.post("/api/runs", json=body)
        assert created.status_code == 202
        id = created.json()["id"]
        app.state.jobs.wait(id)
        run = client.get(f"/api/runs/{id}").json()
        assert run["status"] == "completed" and run["completed"] == 1
        evaluation_id = run["items"][0]["evaluation_id"]
        result = client.get(f"/api/evaluations/{evaluation_id}").json()
        assert result["original"] == result["final"]
        assert result["checklist_snapshot"] == default_checklist()
        assert result["usage_attempt_ids"] == ["fixture-attempt"]
        assert client.get("/api/conversations/fiction-001").json()["evaluation_id"] == evaluation_id
        assert client.get("/api/conversations?checklist_version_id=other").json()["items"][0]["evaluation_id"] is None
        assert client.post("/api/datasets/import", json={"group_id": "DEV", "payload": envelope}).status_code == 200
        assert client.post(f"/api/runs/{id}/cancel").json()["status"] == "completed"
        assert client.get("/api/usage").json()["control_reserve_usd"] == 20
        for path in ("/api/runs/missing", "/api/evaluations/missing"):
            assert client.get(path).status_code == 404
        assert client.post("/api/runs/missing/cancel").status_code == 404
        assert client.post("/api/runs", json={**body, "conversation_ids": ["fiction-001", "fiction-001"]}).status_code == 422
        assert client.post("/api/runs", json={**body, "conversation_ids": ["missing"]}).status_code == 404
        assert client.post("/api/runs", json={**body, "unexpected": True}).status_code == 422


def test_explicit_dispatch_starts_one_coordinator_and_never_redispatches(tmp_path, envelope):
    from concurrent.futures import ThreadPoolExecutor
    store = prepared(tmp_path, envelope, 3)
    manager = JobManager(store, Evaluator(store, FixtureClient()))
    run = manager.start("DEV", [f"fiction-{i}" for i in range(3)], "cqa-v1", background=False)
    assert store.list("evaluations") == []
    entered, release = threading.Event(), threading.Event()
    count = 0
    real_process = manager._process
    def process(id):
        nonlocal count
        count += 1
        entered.set()
        assert release.wait(5)
        real_process(id)
    manager._process = process
    try:
        with ThreadPoolExecutor(max_workers=8) as pool:
            dispatched = list(pool.map(lambda _: manager.dispatch(run["id"]), range(16)))
        assert entered.wait(5)
        assert dispatched.count(True) == 1 and dispatched.count(False) == 15
    finally:
        release.set()
        try:
            manager.wait(run["id"])
            assert manager.dispatch(run["id"]) is False
        finally:
            manager.close()
    assert count == 1 and len(store.list("evaluations")) == 3
