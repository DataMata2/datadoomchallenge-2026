import pytest

from cqa.config import Settings, load_api_key
from cqa.prepare import model_job_lock, normalize_credential, run_stage


def test_credential_loading_and_explicit_normalization_do_not_execute_text(tmp_path, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    env = tmp_path / ".env"
    fixture = "sk-ant-synthetic-test-only"
    env.write_text("Local credential:\n" + fixture + "\n")
    with pytest.raises(ValueError, match="standard"):
        load_api_key(env)
    assert normalize_credential(env) == {"credential_normalized": True}
    assert env.read_text() == "ANTHROPIC_API_KEY=" + fixture + "\n"
    assert env.stat().st_mode & 0o777 == 0o600
    assert load_api_key(env) == fixture
    env.write_text("ANTHROPIC_API_KEY=" + fixture + "\nANTHROPIC_API_KEY=sk-ant-second-fixture\n")
    with pytest.raises(ValueError, match="unambiguous"):
        normalize_credential(env)
    with pytest.raises(ValueError, match="exactly one"):
        load_api_key(env)


def test_paid_preparation_requires_account_before_touching_provider(tmp_path, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    settings = Settings(database_path=tmp_path / "prepare.db", model_lock=tmp_path / "model.lock")
    with pytest.raises(ValueError, match="account"):
        run_stage(settings, "smoke")
    with model_job_lock(settings.model_lock), pytest.raises(ValueError, match="lock is held"):
        with model_job_lock(settings.model_lock):
            pass


def test_normalization_refuses_unrelated_active_settings_without_mutation(tmp_path):
    env = tmp_path / ".env"
    original = ("# Synthetic backend configuration\n"
                "CQA_DATABASE_PATH=runtime/synthetic.sqlite3\n"
                "ANTHROPIC_API_KEY=sk-ant-synthetic-test-only\n"
                "export CQA_MODEL=claude-sonnet-5-5\n")
    env.write_text(original)
    original_mode = env.stat().st_mode
    with pytest.raises(ValueError, match="other active settings"):
        normalize_credential(env)
    assert env.read_text() == original
    assert env.stat().st_mode == original_mode


def test_stage_marker_failure_sends_nothing_and_retry_has_no_duplicate_calls(tmp_path, monkeypatch, envelope):
    import copy
    import cqa.prepare as preparation
    from cqa.datasets import import_dataset
    from cqa.provider import ModelReply
    from cqa.rubric import default_checklist
    from cqa.storage import Store
    settings = Settings(database_path=tmp_path / "prepare.db", model_lock=tmp_path / "model.lock")
    store = Store(settings.database_path)
    source = envelope["data"]["records"][0]
    envelope["data"]["records"] = [{**copy.deepcopy(source), "conversation_id": f"fiction-{language}", "language": language}
                                    for language in ("RU", "KZ", "EN")]
    envelope["data"]["total_records"] = 3
    import_dataset(store, envelope, "DEV")
    store.put("preparation", "account", {"model": "claude-sonnet-5-5", "available": True})
    calls = []
    class FixtureClient:
        model = "claude-sonnet-5-5"
        def __init__(self, budget, **kwargs):
            self.budget = budget
        def generate(self, system, prompt, schema, purpose):
            calls.append(store.get("preparation", "smoke"))
            attempt = self.budget.reserve(model=self.model, purpose=purpose, amount=.1)
            usage = {"input_tokens": 1, "output_tokens": 1}
            self.budget.finish(attempt, status="succeeded", raw_usage=usage, cost=.000012)
            judgments = [{"criterion_id": c["id"], "value": False if c["answer_type"] == "boolean" else c["allowed_values"][-1],
                          "rationale": "Synthetic checked region.", "evidence_turns": [1]}
                         for c in default_checklist()["criteria"]]
            return ModelReply(parsed={"criteria": judgments}, model=self.model, raw_usage=usage,
                              latency_ms=1, attempt_id=attempt, cost_usd=.000012)
    monkeypatch.setattr(preparation, "ModelClient", FixtureClient)
    real_put = Store.put
    failed = False
    def fail_first_stage_marker(self, collection, id, value):
        nonlocal failed
        if collection == "preparation" and id == "smoke" and not failed:
            failed = True
            raise OSError("Synthetic stage-marker write failure")
        return real_put(self, collection, id, value)
    monkeypatch.setattr(Store, "put", fail_first_stage_marker)
    with pytest.raises(OSError, match="stage-marker"):
        run_stage(settings, "smoke")
    calls_after_failure = len(calls)
    assert store.get("preparation", "smoke") is None
    result = run_stage(settings, "smoke")
    assert calls_after_failure == 0
    assert len(calls) == 3
    assert result["status"] == "completed" and result["completed"] == 3
    assert all(marker and marker["run_id"] == result["run_id"] for marker in calls)
    with pytest.raises(ValueError, match="already has a durable run"):
        run_stage(settings, "smoke")
    assert len(calls) == 3
    def fail_dispatch(self, id):
        raise OSError("Synthetic dispatch failure")
    monkeypatch.setattr(preparation.JobManager, "dispatch", fail_dispatch)
    with pytest.raises(OSError, match="dispatch failure"):
        run_stage(settings, "smoke", repeat=True)
    marker = store.get("preparation", "smoke")
    assert marker["run_id"] != result["run_id"] and marker["status"] == "queued"
    assert len(calls) == 3
    with pytest.raises(ValueError, match="already has a durable run"):
        run_stage(settings, "smoke")
    assert len(calls) == 3
