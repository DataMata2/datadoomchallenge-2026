# CQA frontend API contract

Version: 0.1.0 (Tasks 1–2). Base URL: `http://127.0.0.1:8000`; every application route starts with `/api`. No authentication is required for this local prototype. Use the Vite development proxy or explicitly configured `CQA_CORS_ORIGINS`. Run one backend process. Never expose backend credentials in frontend environment variables.

`docs/openapi.json` is generated from the implemented application; `/openapi.json` and `/docs` expose the same live specification. This document also reserves the planned Tasks 2–5 interfaces. A planned route is **not implemented** until its status changes here and it appears in live OpenAPI. Calling an unimplemented route currently returns 404 or 405. `docs/api-examples.json` contains fictional examples only; evaluation examples are fictional implemented shapes; report examples remain planned. No example is a measured outcome.

## Common rules

- IDs are strings. Source `conversation_id` is unchanged. A conversation is identified by `(dataset_id, conversation_id)`; always retain the dataset when following an evidence link.
- Lists return `{items: [...], total: integer}`. `total` counts all matching records before pagination. Conversation lists default to `dataset_id=DEV`, `page=1`, `page_size=50` (maximum 500). Ordering is ascending source conversation ID.
- JSON `false`, `0`, `null` and a failed evaluation have different meanings. Do not coerce booleans to numbers. `null` judgment means N/A only where the criterion permits it; a null total means no applicable weighted criteria or an explicitly failed/unevaluated result.
- Errors use `{detail: string | validation_error_array}`; invalid requests return 422 and missing resources 404. Import validation errors identify fields without reflecting transcript content or recording URLs.
- API calendar instants are ISO 8601 with explicit timezone. Source transcript timestamps are **exceptions**: preserve exact original strings, either chat MM:SS or call ISO 8601 with timezone. Evidence indices are one-based across **all** original turns, including client/bot/system.
- Calendar filtering uses `demo_started_at` in Asia/Almaty, not original call dates or elapsed chat timestamps. Demo scheduling is independent of scores. Its October 2026 assignment uses seed 2026 and version `stratified-october-v1`, sorted source identities, deterministic shuffling, all 31 days for a dataset of at least 31 records, and alternating night/day strata. Reordering import records does not change assignments. Record source content and assigned metadata are immutable after import; a conflicting reimport returns 422. A distinct group cannot overwrite another group's IDs.
- No model evaluation runs on startup or import. Deliberate backend startup marks unfinished prior runs interrupted without resending. App construction and OpenAPI generation perform no recovery. Unevaluated conversations expose `evaluation_id: null`. Holiday interpretation is reserved for Kazakhstan and explicitly unimplemented in Task 1.

## Endpoint status and request contracts

| Method / path | Status | Request / response |
| --- | --- | --- |
| `GET /api/health` | Implemented | `{status: "ok"}` |
| `GET /api/meta` | Implemented | `Meta` |
| `POST /api/datasets/import` | Implemented | `DatasetImportRequest` → `DatasetImportResult` |
| `GET /api/conversations` | Implemented | Queries `dataset_id`, `channel?`, `language?`, `page`, `page_size` → `Page<Conversation>` |
| `GET /api/conversations/{id}` | Implemented | Query `dataset_id=DEV` → `Conversation` |
| `GET /api/checklists` | Implemented | `Page<Checklist>` |
| `GET /api/checklists/{id}` | Implemented | `Checklist` |
| `POST /api/runs` | Implemented | `{dataset_id, conversation_ids: string[], checklist_version_id}` → `Run` with HTTP 202 |
| `GET /api/runs/{id}` | Implemented | `Run` |
| `GET /api/evaluations/{id}` | Implemented | `Evaluation` |
| `GET /api/usage` | Implemented | `UsageSummary` |
| `POST /api/checklists` | **Not implemented — Task 3** | `{name, criteria: CriterionDefinition[], parent_version_id?: string}` → immutable `Checklist` with HTTP 201 |
| `POST /api/appeals` | **Not implemented — Task 3** | `{evaluation_id, criterion_id, comment}` → `Appeal` with HTTP 201 |
| `GET /api/appeals` | **Not implemented — Task 3** | Optional query `evaluation_id` → `Page<Appeal>` |
| `POST /api/appeals/{id}/decision` | **Not implemented — Task 3** | `{action: "confirm" | "change", value?: RawValue, reason}` → `Appeal` |
| `GET /api/exports/{dataset_id}` | **Not implemented — Task 3** | Queries `checklist_version_id=cqa-v1`, `team_name` → `BaselineExport` |
| `POST /api/conversations/search` | **Not implemented — Task 4** | `FilterSpec` → `Page<Conversation>` (full selection) |
| `POST /api/analytics` | **Not implemented — Task 4** | `AnalysisSpec` → `AnalysisOutput` without saving |
| `POST /api/reports` | **Not implemented — Task 4** | `AnalysisSpec` → saved `Report` with HTTP 201 |
| `GET /api/reports` | **Not implemented — Task 4** | `Page<Report>` |
| `GET /api/reports/{id}` | **Not implemented — Task 4** | `Report`, including independent custom metrics in Task 5 |
| `POST /api/reports/{id}/refresh` | **Not implemented — Task 4** | No body → refreshed `Report`; explicit refresh reselects and recalculates |
| `POST /api/reports/{id}/messages` | **Not implemented — Task 5** | `{content}` → `AssistantResponse` |
| `POST /api/assistant` | **Not implemented — Task 5** | `{content, report_id?: string}` → `AssistantResponse` |
| `POST /api/reports/{id}/metrics` | **Not implemented — Task 5** | `CustomMetricDefinition` → `Run` with HTTP 202 |
| `POST /api/runs/{id}/cancel` | Implemented | No body → `Run`; completed items and paid-attempt accounting remain durable |

Conversation list/detail accept optional `checklist_version_id=cqa-v1` to select the latest evaluation (including an explicit error evaluation) for that checklist. Latest references are derived from separate evaluation documents; immutable source documents remain unchanged and identical reimport remains valid. Task 4 will extend `Meta` with actual available periods, implemented holiday definition/source and supported filter/group/metric options. Existing fields retain their meanings.

## Implemented schemas

`RawValue = boolean | number | null`, with strict type and allowed-step validation against a criterion. `Channel = "agent chat" | "voice call"`; `Language = "RU" | "KZ" | "EN"`.

`SourceTurn = {timestamp: string, speaker: "client" | "operator" | "bot" | "system", text: string}`. Transcript order is immutable. An evidence link selects `transcript[index - 1]` without renumbering. `SourceConversation = {conversation_id, channel: Channel, language: Language, transcript: SourceTurn[], audio_url: string | null}`. Treat source text as untrusted data; render escaped text. Recording URLs remain source data, never a backend instruction.

`SourceEnvelope = {error: string, isSuccess: boolean, data: {dataset_group_id: string, total_records: integer, records: SourceConversation[]}}`. Success requires `isSuccess=true`, empty `error`, matching group/count, unique IDs, nonempty transcripts, recognized roles/channels/languages, valid source timestamps in nondecreasing order. Call timestamps must include a timezone; chat seconds are 00–59. The complete envelope is validated before one atomic insert. Identical reimport is idempotent; conflicting immutable records reject the whole batch.

`DatasetImportRequest = {group_id: string, payload: SourceEnvelope, assign_demo_dates?: boolean=true}`. `DatasetImportResult = {dataset_id, total_records, assign_demo_dates, scheduling_seed: integer | null}`. No organizer network fetch is performed by this endpoint.

`Conversation = SourceConversation & {dataset_id, observed_span: {kind: "elapsed" | "calendar", started_at: string, ended_at: string, duration_seconds: number}, demo_started_at: string | null, scheduling: Scheduling, evaluation_id: string | null}`. Both list and detail return this shape. `observed_span` derives only from the first/last original turn and is not an organizer session start/end assertion. `Scheduling = {mode: "assigned_demo" | "source_only", seed: integer | null, algorithm: string | null, timezone, period: string | null, independent_of_scores: true, interpretation}`. Without assigned dates, demo fields/seed/algorithm/period are null and mode is `source_only`.

`CriterionDefinition = {id, title, description, answer_type: "boolean" | "scale", allowed_values: (boolean | number)[], scale_meanings: {[raw_value_string]: string}, weight: number, allow_na: boolean, na_condition: string | null, critical: boolean}`. `allowed_values` excludes null; applicability is controlled separately. Baseline definitions include complete applicability and scale meanings. `Checklist = {id, name, parent_version_id: string | null, instructions, criteria: CriterionDefinition[]}`. A checklist ID is its immutable version ID; default `cqa-v1`.

`Meta = {reporting_timezone, channels: Channel[], languages: Language[], default_checklist_version_id, datasets: {id, total_records}[], scheduling: {mode, period, seed, interpretation}, holiday_calendar: {jurisdiction: "KZ", status: "not_implemented"}, implemented_features: string[]}`. Empty startup has no datasets and one baseline checklist.

## Evaluation, review and export schemas

Judgment, score, run, evaluation and usage schemas are implemented in Task 2. Appeal and export endpoints remain planned for Task 3.

`Judgment = {criterion_id, value: RawValue, rationale, evidence_turns: integer[]}`. Rationale is nonempty; evidence is nonempty, unique and within the full original transcript. Supporting evidence, checked regions for omissions and N/A reasons share this shape.

`ScoredCriterion = Judgment & {weight: number, applicable: boolean, normalized_value: number | null, points: number | null, weighted_score: number | null}`. `points = raw_fraction * weight` before N/A redistribution. `weighted_score = points * 100 / applicable_weight`. `ScoreResult = {criteria: ScoredCriterion[], earned_points: number, applicable_weight: number, final_score: number | null, critical_flag: boolean}`. Total is rounded to two decimal places; intermediate values are not rounded. Unscored critical is separate and does not zero arithmetic. Only the backend computes scores.

`Run = {id, kind: "evaluation" | "custom_metric", dataset_id, conversation_ids: string[], checklist_version_id: string | null, status: "queued" | "running" | "completed" | "failed" | "interrupted" | "cancelled", total: integer, completed: integer, failed: integer, items: RunItem[], created_at, started_at: string | null, finished_at: string | null, error: string | null, model: {mode, name}, checklist_snapshot: Checklist}`. `RunItem = {conversation_id, status: "queued" | "running" | "completed" | "failed" | "interrupted" | "cancelled", evaluation_id: string | null, error: string | null}`. Every requested source ID appears once, including failures. Poll the run while queued/running. Restart does not silently resend interrupted paid requests. Run requests require a nonempty unique ID list, at most 500 IDs, and an existing checklist and source records. Cancellation marks queued work cancelled, allows in-flight paid work to finish durably, and leaves completed items intact. A cancelled run has a null `finished_at` while in-flight work finishes. Completed/failed counts exclude cancelled/interrupted items; every requested ID remains visible.

`Evaluation = {id, dataset_id, conversation_id, run_id, status: "ok" | "error", checklist_version_id, checklist_snapshot: Checklist, model: {mode: "external_api" | "local" | "hybrid", name}, prompt_version, original: ScoreResult | null, final: ScoreResult | null, usage_attempt_ids: string[], created_at, error: string | null, appeals: Appeal[]}`. Original assessment is immutable. Final results can change only through documented review. Model/prompt/checklist identity is retained with the assessment. Error status has null scores and an actionable reason.

`UsageSummary = {currency: "USD", hard_limit_usd: number, working_limit_usd: number, control_reserve_usd: number, spent_usd: number, reserved_usd: number, remaining_usd: number, working_remaining_usd: number, attempts: UsageAttempt[]}`. `UsageAttempt = {id, run_id: string | null, purpose, model, status, started_at, finished_at: string | null, latency_ms: number | null, provider_request_id: string | null, provider_message_id: string | null, raw_usage: object | null, input_tokens: integer | null, output_tokens: integer | null, cost_usd: number | null, reserved_usd: number, reservation_usd: number, allowance: "working" | "control", max_tokens: integer | null, rates: object, error: string | null, stop_reason: string | null, stop_details: object | null}`. Failed/schema-invalid attempts retain usage. Unknown outcomes retain reservations. Hard cap is USD 100; regular working allowance USD 80 and control/recovery reserve USD 20. `reserved_usd` is the outstanding reservation; `reservation_usd` retains its original amount. Statuses include `reserved`, `received`, `succeeded`, `invalid_output`, `failed`, `unknown` and `cancelled`. Usage settles before output parsing. `remaining_usd` includes the control reserve; `working_remaining_usd` is the amount still available under the working allowance. Unknown outcomes retain reservations across restart. Standard Sonnet requests reserve USD 2.04096 before send (1M input-token upper bound plus 4,096 output tokens); actual billed usage releases the remainder. Rates and raw provider usage are retained. SDK retries are disabled, timeout is 90 seconds, and all provider consumers share a maximum of two in-flight requests. No model request occurs inside a database transaction.

`Appeal = {id, evaluation_id, criterion_id, comment, status: "open" | "confirmed" | "changed", created_at, decision: {action: "confirm" | "change", value: RawValue, reason, created_at} | null}`. A change uses strict evaluated-snapshot scale/applicability rules; a reason is mandatory for either decision. Original evaluation remains unchanged. A decided appeal cannot receive another decision.

`BaselineExport = {schema_version: "1.0", team_name, model: {mode: "local" | "external_api" | "hybrid", name}, results: ExportRecord[]}`. Success record: `{conversation_id, status: "ok", criteria: Judgment[], score: {final_score: number, critical_flag: boolean}}`. Error record: `{conversation_id, status: "error", criteria: [], score: null, error}`. Include every dataset record once. Baseline success requires exactly the eight prescribed IDs; export uses final reviewed values and source IDs. Missing evaluations and incompatible checklist versions are explicit errors, never fabricated grades. Full DEV/control JSON generation is later work.

## Planned analysis and assistant schemas

`FilterSpec = {dataset_id?: string="DEV", channel?: Channel, language?: Language, start_at?: ISO_timestamp, end_at?: ISO_timestamp, hours?: {start: integer 0..23, end: integer 0..23}, weekdays?: integer[1..7][], holiday?: boolean, min_score?: number 0..100, max_score?: number 0..100, critical?: boolean}`. Optional fields are omitted when not constrained. Start is inclusive and end exclusive; calendar instants are converted to Almaty. Hours are local and end exclusive, including overnight windows; equal endpoints mean a full day. ISO weekdays use Monday=1. Holiday false means exclude dates defined by the verified Kazakhstan calendar. Score/critical filters exclude missing evaluations and retain numeric zero. Interpretation and eligibility counts are visible in output.

`AnalysisSpec = {filters: FilterSpec, group_by?: "none" | "date" | "month_half" | "daypart" | "holiday" | "language" | "channel"="none", metric_ids?: string[]=["final_score", "contact", "discovery", "identification", "consultation", "empathy", "dialogue", "closure", "critical"], title: string}`. Metrics are allowlisted. Daypart uses night 00:00–05:59, morning 06:00–11:59, afternoon 12:00–17:59 and evening 18:00–23:59. Month halves are days 1–15 and 16–month end.

`AnalysisOutput = {spec: AnalysisSpec, checklist_version_id, conversation_ids: string[], evaluation_ids: string[], counts: {selected, evaluated, unevaluated, failed}, definitions: object, filter_interpretation: string[], groups: AnalysisGroup[], chart_series: object[], generated_at}`. `AnalysisGroup = {key, label, conversation_ids: string[], counts: {selected, evaluated, unevaluated, failed}, metrics: {[metric_id]: {value: number | null, sample_count: integer, na_count: integer}}}`. Overall mean averages final conversation scores. Per-criterion means use normalized fractions (0–100) over applicable evaluated records. Critical is a separate percentage. Empty means are null, never zero. Numerical aggregates are computed in code; no model supplies authoritative figures.

`Report = {id, title, spec: AnalysisSpec, output: AnalysisOutput, created_at, updated_at, messages: ReportMessage[], custom_metrics: ReportMetric[]}`. Output snapshots retain source/evaluation IDs and definitions. Refresh is explicit. `ReportMessage = {id, role: "user" | "assistant", content, created_at}`.

`CustomMetricDefinition = {id, title, description, answer_type: "boolean" | "scale", allowed_values: (boolean | number)[], allow_na: boolean}`. These metrics have no weight in the baseline score. `ReportMetric = {definition: CustomMetricDefinition, run_id, status, results: {conversation_id, status, judgment: Judgment | null, error: string | null}[], aggregates: object}`. Results/usage remain separate from regular evaluations and exports; partial failure and cancellation remain visible.

`AssistantResponse = {message: string, report_id: string | null, spec: AnalysisSpec | null, output: AnalysisOutput | null, custom_metric_run_id: string | null, clarification: string | null}`. Ambiguous requests return clarification without running an invented query. Internally the only action operations are `update_analysis | add_metric | clarify`, with validated analysis patches, an explanation and an optional custom metric. Unknown fields/IDs and arbitrary SQL, Python, URLs or tool instructions are rejected. Follow-up patches retain prior unconstrained fields. Custom metric runs never change regular QA scores or baseline export values.

## Local development

From the repository root:

```bash
export UV_CACHE_DIR="$PWD/.cache/uv"
uv sync --project backend --python /home/datamata/.local/share/uv/python/cpython-3.12.13-linux-x86_64-gnu/bin/python3.12
uv run --project backend uvicorn cqa.main:app --host 127.0.0.1 --port 8000
uv run --project backend pytest backend/tests -q
```

The backend defaults to ignored `runtime/cqa.sqlite3`. Set `CQA_DATABASE_PATH` to choose a local file. Source payloads, recordings, credentials and runtime databases must remain outside Git. No data import, inference, paid request or organizer URL access occurs automatically.


## Explicit provider preparation

Backend `Settings` read `CQA_MODEL` (default `claude-sonnet-5-5`) and the ignored backend `CQA_ENV_FILE` path. The credential is loaded only for an explicit provider operation. Only the verified Sonnet model/rate combination is enabled; a different model needs an explicit implementation and verification of rates/capabilities. The model uses the Anthropic SDK 2.6.0 synchronous client, API 2026-10-21, native `output_config.format` JSON, and no sampling parameters or forced tools. Every assessment sends the full numbered transcript and complete immutable checklist, and deterministic Python validation/scoring supplies totals.

Run the commands from the repository root with `CQA_ENV_FILE` set to the original ignored secret file:

```bash
uv run --locked --project backend python -m cqa.prepare account
uv run --locked --project backend python -m cqa.prepare smoke
uv run --locked --project backend python -m cqa.prepare dev
```

`account` checks the authenticated model list without inference. `smoke` evaluates one DEV source record in each of RU/KZ/EN; `dev` requires that successful smoke and exactly 65 DEV records. Every run and preparation marker is persisted in the configured local database. Preparation creates a queued run, saves its attempted-stage marker, then explicitly dispatches it; marker persistence failure sends no requests. Dispatch launches at most one coordinator for a queued run. Already attempted preparation stages require explicit `--repeat`; interrupted runs are never resumed automatically. To retry selected failures, create a new run explicitly and retain the prior run/attempt evidence. Normal app runs do not require preparation markers.

`CQA_MODEL_LOCK` overrides the project-only lock path, default `runtime/model-jobs.lock`. The preparation commands acquire this nonblocking `flock` for the full stage. It coordinates this project only. Run one backend process and stop it before running preparation against the same database. OpenAPI generation must use a separate disposable database and must not enter the app lifespan.

Credential normalization is an explicit one-time command: `python -m cqa.prepare normalize-credential`. It requires exactly one unambiguous credential in the configured file and refuses files with other active settings before any mutation. For a dedicated credential file, it replaces that same ignored file with a standard assignment, restricts permissions to 0600 and emits no credential material. It does not run automatically.
