"""Typed local API: immutable sources and explicit evaluation workflows."""

import asyncio
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .config import Settings
from .budget import Budget
from .provider import ModelClient
from .evaluations import Evaluator
from .jobs import JobManager
from .datasets import conversation_key, import_dataset
from .models import (
    Channel, Checklist, ChecklistPage, ConversationPage, ConversationResponse,
    DatasetImportRequest, DatasetImportResult, HealthResponse, Language, MetaResponse,
    Run, RunRequest, Evaluation, UsageSummary,
)
from .rubric import default_checklist
from .storage import Store


def create_app(settings: Settings | None = None, *, model_client=None) -> FastAPI:
    settings = settings or Settings()
    store = Store(settings.database_path)
    store.insert_immutable("checklists", {"cqa-v1": default_checklist()})
    budget = Budget(store)
    model_client = model_client or ModelClient(budget, settings=settings)
    evaluator = Evaluator(store, model_client)
    jobs = JobManager(store, evaluator)

    @asynccontextmanager
    async def lifespan(_app):
        jobs.startup()
        try:
            yield
        finally:
            await asyncio.to_thread(jobs.close)

    app = FastAPI(lifespan=lifespan, title="CQA API", version="0.1.0", description="Local conversation quality analytics. Only implemented routes appear here; planned routes are documented in docs/api-contract.md.")
    app.state.store = store
    app.state.settings = settings
    app.state.budget = budget
    app.state.model_client = model_client
    app.state.evaluator = evaluator
    app.state.jobs = jobs
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.exception_handler(RequestValidationError)
    async def request_validation_error(_request, error):
        # FastAPI's default includes invalid input; source data must not be reflected.
        detail = [{key: item[key] for key in ("loc", "msg", "type")} for item in error.errors()]
        return JSONResponse(status_code=422, content={"detail": detail})

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/api/meta", response_model=MetaResponse)
    def meta() -> dict:
        rows = store.list("conversations")
        datasets = sorted({row["dataset_id"] for row in rows})
        return {"reporting_timezone": settings.reporting_timezone, "channels": ["agent chat", "voice call"],
                "languages": ["RU", "KZ", "EN"], "default_checklist_version_id": "cqa-v1",
                "datasets": [{"id": id, "total_records": sum(row["dataset_id"] == id for row in rows)} for id in datasets],
                "scheduling": {"mode": "assigned_demo", "period": "2026-10", "seed": 2026,
                               "interpretation": "Calendar filters use separate assigned demonstration dates in Asia/Almaty, independent of scores."},
                "holiday_calendar": {"jurisdiction": "KZ", "status": "not_implemented"},
                "implemented_features": ["dataset_import", "conversation_read", "checklist_read", "evaluation_runs", "run_cancellation", "usage_accounting"]}

    @app.post("/api/datasets/import", response_model=DatasetImportResult)
    def dataset_import(request: DatasetImportRequest) -> dict:
        try:
            return import_dataset(store, request.payload.model_dump(), request.group_id, request.assign_demo_dates)
        except ValidationError as error:
            # Avoid reflecting transcript text or recording URLs in validation errors.
            locations = [".".join(map(str, item["loc"])) for item in error.errors()]
            raise HTTPException(422, detail="Invalid source fields: " + ", ".join(locations)) from error
        except ValueError as error:
            raise HTTPException(422, detail=str(error)) from error

    def conversation_response(row: dict, checklist_version_id: str) -> dict:
        evaluation = jobs.latest_evaluation(row["dataset_id"], row["conversation_id"], checklist_version_id)
        return {**row, "evaluation_id": evaluation["id"] if evaluation else None}

    @app.get("/api/conversations", response_model=ConversationPage)
    def conversations(dataset_id: str = "DEV", channel: Channel | None = None, language: Language | None = None,
                      page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=500)] = 50, checklist_version_id: str = "cqa-v1") -> dict:
        rows = [row for row in store.list("conversations") if row["dataset_id"] == dataset_id
                and (channel is None or row["channel"] == channel) and (language is None or row["language"] == language)]
        rows.sort(key=lambda row: row["conversation_id"])
        start = (page - 1) * page_size
        return {"items": [conversation_response(row, checklist_version_id) for row in rows[start:start + page_size]], "total": len(rows)}

    @app.get("/api/conversations/{id}", response_model=ConversationResponse)
    def conversation(id: str, dataset_id: str = "DEV", checklist_version_id: str = "cqa-v1") -> dict:
        row = store.get("conversations", conversation_key(dataset_id, id))
        if row is None:
            raise HTTPException(404, detail="Conversation not found in the selected dataset")
        return conversation_response(row, checklist_version_id)

    @app.get("/api/checklists", response_model=ChecklistPage)
    def checklists() -> dict:
        items = store.list("checklists")
        return {"items": items, "total": len(items)}

    @app.get("/api/checklists/{id}", response_model=Checklist)
    def checklist(id: str) -> dict:
        row = store.get("checklists", id)
        if row is None:
            raise HTTPException(404, detail="Checklist version not found")
        return row

    @app.post("/api/runs", response_model=Run, status_code=202)
    def start_run(request: RunRequest) -> dict:
        try:
            return jobs.start(request.dataset_id, request.conversation_ids, request.checklist_version_id)
        except KeyError as error:
            raise HTTPException(404, detail=error.args[0]) from None
        except ValueError as error:
            raise HTTPException(422, detail=str(error)) from None

    @app.get("/api/runs/{id}", response_model=Run)
    def get_run(id: str) -> dict:
        try:
            return jobs.get(id)
        except KeyError:
            raise HTTPException(404, detail="Run not found") from None

    @app.post("/api/runs/{id}/cancel", response_model=Run)
    def cancel_run(id: str) -> dict:
        try:
            return jobs.cancel(id)
        except KeyError:
            raise HTTPException(404, detail="Run not found") from None

    @app.get("/api/evaluations/{id}", response_model=Evaluation)
    def get_evaluation(id: str) -> dict:
        row = store.get("evaluations", id)
        if row is None:
            raise HTTPException(404, detail="Evaluation not found")
        return row

    @app.get("/api/usage", response_model=UsageSummary)
    def usage() -> dict:
        return budget.summary()

    return app


app = create_app()
