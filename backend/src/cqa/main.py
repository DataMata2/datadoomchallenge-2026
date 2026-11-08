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
    Run, RunRequest, Evaluation, UsageSummary, WorkspaceSettings,
    Appeal, AppealPage, AppealRequest, ChecklistCreateRequest, DecisionRequest, BaselineExport,
)
from .preferences import Preferences
from .rubric import default_checklist
from .storage import Store
from .workflows import ReviewConflict, Workflows
from .exports import build_baseline_export
from .analytics import analyze, filtering_options, scheduling_summary, select_conversations, CALENDAR
from .analytics_models import AnalysisOutput, AnalysisSpec, FilterSpec, Report, ReportPage
from .reports import Reports
from .assistant import Assistant, AssistantRequest, AssistantResponse, MessageRequest
from .custom_metrics import CustomMetrics, MetricConflict
from .metric_models import CustomAssessment
from .models import CustomMetricDefinition


def create_app(settings: Settings | None = None, *, model_client=None) -> FastAPI:
    settings = settings or Settings()
    store = Store(settings.database_path)
    store.insert_immutable("checklists", {"cqa-v1": default_checklist()})
    budget = Budget(store)
    model_client = model_client or ModelClient(budget, settings=settings)
    evaluator = Evaluator(store, model_client)
    jobs = JobManager(store, evaluator)
    preferences = Preferences(store)
    workflows = Workflows(store)
    reports = Reports(store)
    metrics = CustomMetrics(store, jobs)
    assistant = Assistant(store, reports, metrics, model_client)

    @asynccontextmanager
    async def lifespan(_app):
        jobs.startup()
        try:
            yield
        finally:
            await asyncio.to_thread(jobs.close)

    app = FastAPI(lifespan=lifespan, title="CQA API", version="0.1.0", description="Local conversation quality analytics with deterministic saved reports, assistant actions and independent custom metrics.")
    app.state.preferences = preferences
    app.state.store = store
    app.state.settings = settings
    app.state.budget = budget
    app.state.model_client = model_client
    app.state.evaluator = evaluator
    app.state.jobs = jobs
    app.state.workflows = workflows
    app.state.reports = reports
    app.state.metrics = metrics
    app.state.assistant = assistant
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.exception_handler(RequestValidationError)
    async def request_validation_error(_request, error):
        # FastAPI's default includes invalid input; source data must not be reflected.
        detail = [{key: item[key] for key in ("loc", "msg", "type")} for item in error.errors()]
        return JSONResponse(status_code=422, content={"detail": detail})

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/api/settings", response_model=WorkspaceSettings)
    def workspace_settings() -> WorkspaceSettings:
        return preferences.get()

    @app.post("/api/settings", response_model=WorkspaceSettings)
    def save_workspace_settings(request: WorkspaceSettings) -> WorkspaceSettings:
        return preferences.save(request)

    @app.get("/api/meta", response_model=MetaResponse)
    def meta() -> dict:
        rows = store.list("conversations")
        datasets = sorted({row["dataset_id"] for row in rows})
        scheduling = scheduling_summary(rows)
        return {"reporting_timezone": settings.reporting_timezone, "channels": ["agent chat", "voice call"],
                "languages": ["RU", "KZ", "EN"], "default_checklist_version_id": "cqa-v1",
                "datasets": [{"id": id, "total_records": sum(row["dataset_id"] == id for row in rows)} for id in datasets],
                "scheduling": scheduling, "available_periods": scheduling["periods"],
                "filtering_options": filtering_options(), "holiday_calendar": CALENDAR,
                "implemented_features": ["dataset_import", "conversation_read", "checklist_read", "evaluation_runs", "run_cancellation", "usage_accounting", "checklist_versions", "appeals", "baseline_export", "conversation_search", "analytics", "saved_reports", "assistant", "custom_metrics", "workspace_settings"]}

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

    @app.post("/api/conversations/search", response_model=ConversationPage)
    def search_conversations(request: FilterSpec) -> dict:
        items = select_conversations(store, request)
        return {"items": items, "total": len(items)}

    @app.post("/api/analytics", response_model=AnalysisOutput)
    def analytics(request: AnalysisSpec) -> dict:
        return analyze(store, request)

    @app.post("/api/reports", response_model=Report, status_code=201)
    def create_report(request: AnalysisSpec) -> dict:
        return reports.create(request)

    @app.get("/api/reports", response_model=ReportPage)
    def list_reports() -> dict:
        items = reports.list()
        return {"items": items, "total": len(items)}

    @app.get("/api/reports/{id}", response_model=Report)
    def get_report(id: str) -> dict:
        try:
            return reports.get(id)
        except KeyError as error:
            raise HTTPException(404, detail=error.args[0]) from None

    @app.post("/api/reports/{id}/refresh", response_model=Report)
    def refresh_report(id: str) -> dict:
        try:
            return reports.refresh(id)
        except KeyError as error:
            raise HTTPException(404, detail=error.args[0]) from None
        except ValueError as error:
            raise HTTPException(422, detail=str(error)) from None

    @app.post("/api/assistant", response_model=AssistantResponse)
    def assistant_message(request: AssistantRequest) -> dict:
        try:
            return assistant.message(request.content, request.report_id)
        except KeyError as error:
            raise HTTPException(404, detail=error.args[0]) from None

    @app.post("/api/reports/{id}/messages", response_model=AssistantResponse)
    def report_message(id: str, request: MessageRequest) -> dict:
        try:
            return assistant.message(request.content, id)
        except KeyError as error:
            raise HTTPException(404, detail=error.args[0]) from None

    @app.post("/api/reports/{id}/metrics", response_model=Run, status_code=202)
    def add_metric(id: str, request: CustomMetricDefinition) -> dict:
        try:
            return metrics.start(id, request.model_dump())
        except KeyError as error:
            raise HTTPException(404, detail=error.args[0]) from None
        except MetricConflict as error:
            raise HTTPException(409, detail=str(error)) from None
        except ValueError as error:
            raise HTTPException(422, detail=str(error)) from None
        except RuntimeError as error:
            raise HTTPException(503, detail=str(error)) from None

    @app.post("/api/reports/{id}/metrics/{metric_id}/runs", response_model=Run, status_code=202)
    def rerun_metric(id: str, metric_id: str) -> dict:
        try:
            return metrics.start(id, metric_id=metric_id)
        except KeyError as error:
            raise HTTPException(404, detail=error.args[0]) from None
        except MetricConflict as error:
            raise HTTPException(409, detail=str(error)) from None
        except ValueError as error:
            raise HTTPException(422, detail=str(error)) from None
        except RuntimeError as error:
            raise HTTPException(503, detail=str(error)) from None

    @app.get("/api/custom-assessments/{id}", response_model=CustomAssessment)
    def custom_assessment(id: str) -> dict:
        row = store.get('custom_assessments', id)
        if row is None:
            raise HTTPException(404, detail="Custom assessment not found")
        return row

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

    @app.post("/api/checklists", response_model=Checklist, status_code=201)
    def create_checklist(request: ChecklistCreateRequest) -> dict:
        try:
            return workflows.create_checklist(request)
        except KeyError as error:
            raise HTTPException(404, detail=error.args[0]) from None

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

    @app.post("/api/appeals", response_model=Appeal, status_code=201)
    def create_appeal(request: AppealRequest) -> dict:
        try:
            return workflows.create_appeal(request)
        except KeyError as error:
            raise HTTPException(404, detail=error.args[0]) from None
        except ValueError as error:
            raise HTTPException(422, detail=str(error)) from None

    @app.get("/api/appeals", response_model=AppealPage)
    def appeals(evaluation_id: str | None = None) -> dict:
        items = workflows.appeals(evaluation_id)
        return {"items": items, "total": len(items)}

    @app.post("/api/appeals/{id}/decision", response_model=Appeal)
    def appeal_decision(id: str, request: DecisionRequest) -> dict:
        try:
            return workflows.decide(id, request)
        except KeyError as error:
            raise HTTPException(404, detail=error.args[0]) from None
        except ReviewConflict as error:
            raise HTTPException(409, detail=str(error)) from None
        except ValueError as error:
            raise HTTPException(422, detail=str(error)) from None

    @app.get("/api/exports/{dataset_id}", response_model=BaselineExport)
    def export_dataset(dataset_id: str, team_name: Annotated[str, Query(min_length=1)],
                       checklist_version_id: str = "cqa-v1") -> dict:
        try:
            return build_baseline_export(store, jobs, dataset_id, team_name, checklist_version_id)
        except KeyError as error:
            raise HTTPException(404, detail=error.args[0]) from None
        except ValueError as error:
            # Pydantic errors can contain entire rows; return only a safe export boundary error.
            detail = "Export failed strict schema/value/evidence validation; inspect stored assessments before exporting" if isinstance(error, ValidationError) else str(error)
            raise HTTPException(422, detail=detail) from None

    @app.get("/api/usage", response_model=UsageSummary)
    def usage() -> dict:
        return budget.summary()

    return app


app = create_app()
