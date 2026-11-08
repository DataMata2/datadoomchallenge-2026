"""Single-owner production launcher; acquire ownership before app import/recovery."""

from contextlib import contextmanager
import fcntl
import importlib
import os
from pathlib import Path

from .config import Settings


@contextmanager
def owner_lock(database_path: Path):
    """Hold the shared dev/production owner lock without ever unlinking its inode."""
    if not database_path.is_absolute():
        raise ValueError("CQA_DATABASE_PATH must be an absolute path")
    database_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(str(database_path) + ".server.lock", os.O_CREAT | os.O_RDWR, 0o600)
    with os.fdopen(descriptor, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another API owner holds this database; stop its owner before starting a replacement") from None
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def main():
    settings = Settings()
    if not settings.model_lock.is_absolute():
        raise ValueError("CQA_MODEL_LOCK must be an absolute path")
    if settings.env_file is not None and (
        not settings.env_file.is_absolute() or not os.access(settings.env_file, os.R_OK)
    ):
        raise ValueError("CQA_ENV_FILE must be an absolute, readable backend secret-file path")
    with owner_lock(settings.database_path):
        # cqa.main constructs its app on import. Import only after ownership succeeds.
        application = importlib.import_module("cqa.main").app
        uvicorn = importlib.import_module("uvicorn")
        uvicorn.run(
            application, host="0.0.0.0", port=8000, workers=1,
            proxy_headers=False, timeout_graceful_shutdown=120,
        )


if __name__ == "__main__":
    main()
