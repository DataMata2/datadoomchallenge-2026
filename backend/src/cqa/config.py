"""Backend-only runtime configuration; importing this module reads no secret files."""

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_path: Path = field(default_factory=lambda: Path(os.getenv("CQA_DATABASE_PATH", "runtime/cqa.sqlite3")))
    reporting_timezone: str = "Asia/Almaty"
    env_file: Path | None = field(default_factory=lambda: Path(os.environ["CQA_ENV_FILE"]) if os.getenv("CQA_ENV_FILE") else None)
    model: str = field(default_factory=lambda: os.getenv("CQA_MODEL", "claude-sonnet-5-5"))
    model_timeout_seconds: float = 90.0
    max_output_tokens: int = 4096
    model_allowance: str = "working"
    model_lock: Path = field(default_factory=lambda: Path(os.getenv("CQA_MODEL_LOCK", "runtime/model-jobs.lock")))
    cors_origins: tuple[str, ...] = field(default_factory=lambda: tuple(
        origin.strip() for origin in os.getenv("CQA_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()
    ))


def load_api_key(env_file: Path | None = None) -> str:
    """Read only a standard backend assignment, never execute or log env content."""
    import re
    value = os.getenv("ANTHROPIC_API_KEY")
    if value:
        return value
    if env_file is None:
        raise ValueError("Set backend ANTHROPIC_API_KEY or CQA_ENV_FILE before starting a model run")
    try:
        lines = env_file.read_text().splitlines()
    except OSError:
        raise ValueError("Cannot read configured backend credential file") from None
    matches = []
    for line in lines:
        match = re.fullmatch(r"\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*['\"]?(sk-ant-[A-Za-z0-9_-]+)['\"]?\s*", line)
        if match:
            matches.append(match.group(1))
    if len(matches) != 1:
        raise ValueError("Credential file must contain exactly one standard ANTHROPIC_API_KEY assignment")
    return matches[0]
