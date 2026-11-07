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
