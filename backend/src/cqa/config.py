"""Backend-only runtime configuration; importing this module reads no secret files."""

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_path: Path = field(default_factory=lambda: Path(os.getenv("CQA_DATABASE_PATH", "runtime/cqa.sqlite3")))
    reporting_timezone: str = "Asia/Almaty"
    cors_origins: tuple[str, ...] = field(default_factory=lambda: tuple(
        origin.strip() for origin in os.getenv("CQA_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()
    ))
