"""Production ownership tests use disposable files and isolated child processes."""

import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest

from cqa import server


PROBE = """
import fcntl
from pathlib import Path
import sys
with open(str(Path(sys.argv[1])) + ".server.lock", "a") as lock:
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit(23)
"""


def probe_owner(database):
    return subprocess.run(
        [sys.executable, "-c", PROBE, str(database)],
        capture_output=True, text=True, timeout=5,
    ).returncode


@pytest.fixture
def production_paths(tmp_path, monkeypatch):
    database = tmp_path / "private" / "cqa.sqlite3"
    monkeypatch.setenv("CQA_DATABASE_PATH", str(database))
    monkeypatch.setenv("CQA_MODEL_LOCK", str(tmp_path / "model-jobs.lock"))
    monkeypatch.delenv("CQA_ENV_FILE", raising=False)
    return database


def test_importing_launcher_does_not_import_app_or_create_database(tmp_path):
    database = tmp_path / "untouched.sqlite3"
    environment = {**os.environ, "CQA_DATABASE_PATH": str(database),
                   "PYTHONPATH": str(Path(server.__file__).resolve().parents[1])}
    result = subprocess.run(
        [sys.executable, "-c", "import sys; import cqa.server; assert 'cqa.main' not in sys.modules"],
        env=environment, capture_output=True, text=True, timeout=5,
    )
    assert result.returncode == 0, result.stderr
    assert not database.exists()
    assert not Path(str(database) + ".server.lock").exists()


def test_second_process_refused_before_app_import_or_recovery(production_paths):
    source = """
from cqa import server

def forbidden_import(name):
    raise AssertionError("Application import occurred before owner refusal: " + name)

server.importlib.import_module = forbidden_import
try:
    server.main()
except RuntimeError as error:
    assert "Another API owner" in str(error)
else:
    raise AssertionError("Second owner was accepted")
"""
    with server.owner_lock(production_paths):
        result = subprocess.run(
            [sys.executable, "-c", source], capture_output=True, text=True, timeout=5,
            env={**os.environ, "PYTHONPATH": str(Path(server.__file__).resolve().parents[1])},
        )
        assert result.returncode == 0, result.stderr
        assert probe_owner(production_paths) == 23
        assert not production_paths.exists()
    assert probe_owner(production_paths) == 0


def test_launcher_holds_lock_through_app_import_and_uvicorn_shutdown(production_paths, monkeypatch):
    application = object()
    imports = []
    calls = []

    def run(app, **options):
        assert probe_owner(production_paths) == 23
        calls.append((app, options))

    def import_module(name):
        imports.append(name)
        assert probe_owner(production_paths) == 23
        if name == "cqa.main":
            return SimpleNamespace(app=application)
        assert name == "uvicorn"
        return SimpleNamespace(run=run)

    monkeypatch.setattr(server.importlib, "import_module", import_module)
    server.main()
    assert imports == ["cqa.main", "uvicorn"]
    assert calls == [(application, {
        "host": "0.0.0.0", "port": 8000, "workers": 1,
        "proxy_headers": False, "timeout_graceful_shutdown": 120,
    })]
    assert probe_owner(production_paths) == 0


@pytest.mark.parametrize("failure", ["app_import", "server_error", "startup_exit"])
def test_failure_cleanup_releases_owner_lock(production_paths, monkeypatch, failure):
    error = SystemExit(3) if failure == "startup_exit" else ValueError("synthetic startup failure")

    def run(*_args, **_kwargs):
        raise error

    def import_module(name):
        if name == "cqa.main":
            if failure == "app_import":
                raise error
            return SimpleNamespace(app=object())
        return SimpleNamespace(run=run)

    monkeypatch.setattr(server.importlib, "import_module", import_module)
    with pytest.raises(type(error)):
        server.main()
    assert probe_owner(production_paths) == 0


def test_owner_lock_is_private_and_keeps_same_inode(production_paths):
    lock_path = Path(str(production_paths) + ".server.lock")
    with server.owner_lock(production_paths):
        inode = lock_path.stat().st_ino
        assert lock_path.stat().st_mode & 0o777 == 0o600
    with server.owner_lock(production_paths):
        assert lock_path.stat().st_ino == inode


def test_relative_database_path_is_rejected():
    with pytest.raises(ValueError, match="CQA_DATABASE_PATH must be an absolute path"):
        with server.owner_lock(Path("relative.sqlite3")):
            pytest.fail("Relative database path was accepted")


@pytest.mark.parametrize("invalid_setting", ["model_lock", "env_file"])
def test_invalid_paths_refused_before_app_import(production_paths, monkeypatch, invalid_setting):
    if invalid_setting == "model_lock":
        monkeypatch.setenv("CQA_MODEL_LOCK", "relative.lock")
    else:
        monkeypatch.setenv("CQA_ENV_FILE", str(production_paths.parent / "missing.env"))

    def forbidden_import(name):
        pytest.fail("Invalid runtime settings reached application import: " + name)

    monkeypatch.setattr(server.importlib, "import_module", forbidden_import)
    with pytest.raises(ValueError, match="absolute"):
        server.main()
    assert not production_paths.exists()
