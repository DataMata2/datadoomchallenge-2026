"""Durable workspace preferences, independent of source-language selection."""

from .models import Language, WorkspaceSettings


class Preferences:
    def __init__(self, store):
        self.store = store

    def get(self) -> WorkspaceSettings:
        # A read returns the default without inserting or migrating documents.
        return WorkspaceSettings.model_validate(self.store.get("workspace_settings", "workspace") or {})

    def save(self, settings: WorkspaceSettings) -> WorkspaceSettings:
        settings = WorkspaceSettings.model_validate(settings)
        self.store.put("workspace_settings", "workspace", settings.model_dump())
        return settings


def run_language(store, run_id: str) -> Language:
    """Legacy runs and standalone historical evaluator calls were English."""
    run = store.get("runs", run_id)
    return WorkspaceSettings(analysis_language=run.get("analysis_language", "EN") if run else "EN").analysis_language


def language_name(language: Language) -> str:
    return {"RU": "Russian", "KZ": "Kazakh", "EN": "English"}[language]
