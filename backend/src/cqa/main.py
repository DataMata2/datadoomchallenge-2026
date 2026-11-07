"""Read/import HTTP boundary. Later tasks add explicit workflow routers."""

from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .config import Settings
from .datasets import conversation_key, import_dataset
from .models import (
    Channel, Checklist, ChecklistPage, ConversationPage, ConversationResponse,
    DatasetImportRequest, DatasetImportResult, HealthResponse, Language, MetaResponse,
)
from .rubric import default_checklist
from .storage import Store


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    store = Store(settings.database_path)
    store.insert_immutable("checklists", {"cqa-v1": default_checklist()})
    app = FastAPI(title="CQA API", version="0.1.0", description="Local conversation quality analytics. Only implemented routes appear here; planned routes are documented in docs/api-contract.md.")
    app.state.store = store
    app.state.settings = settings
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
                "implemented_features": ["dataset_import", "conversation_read", "checklist_read"]}

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

    def conversation_response(row: dict) -> dict:
        return {**row, "evaluation_id": row.get("evaluation_id")}

    @app.get("/api/conversations", response_model=ConversationPage)
    def conversations(dataset_id: str = "DEV", channel: Channel | None = None, language: Language | None = None,
                      page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=500)] = 50) -> dict:
        rows = [row for row in store.list("conversations") if row["dataset_id"] == dataset_id
                and (channel is None or row["channel"] == channel) and (language is None or row["language"] == language)]
        rows.sort(key=lambda row: row["conversation_id"])
        start = (page - 1) * page_size
        return {"items": [conversation_response(row) for row in rows[start:start + page_size]], "total": len(rows)}

    @app.get("/api/conversations/{id}", response_model=ConversationResponse)
    def conversation(id: str, dataset_id: str = "DEV") -> dict:
        row = store.get("conversations", conversation_key(dataset_id, id))
        if row is None:
            raise HTTPException(404, detail="Conversation not found in the selected dataset")
        return conversation_response(row)

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

    return app


app = create_app()
