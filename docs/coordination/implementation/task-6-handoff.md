# Task 6 frontend integration handoff

The React/TypeScript/Vite app is a local functional reference. `frontend/src/api.ts` exports typed resource operations; `api-types.ts` is generated solely from reviewed `docs/openapi.json`. Teammate visual work can replace components/styles while retaining the transport layer. No hosting, Site registration, publication or remote repository settings are involved.

## Structure and design intent

- `App.tsx`: overview filters, navigation, application selections and shared source drawer.
- `Analysis.tsx`: backend aggregates/comparisons, denominator inspection and source drilldown. Group-specific measures are labelled and selectable; unknown values never become zero grades.
- `ReportWorkspace.tsx`: saved report selection, assistant messages, independent metric definition/history/coverage/results. Assistant responses use the actual structured `message` object and `metric_run_id` contract. Report and metric refreshes are local data operations; custom creation/reruns and assistant requests intentionally start model work.
- `ConversationDrawer.tsx`: immutable source transcript/audio, one-based evidence highlights, evaluated checklist snapshot, raw/maximum/weight/total explanation, original/final toggle, evaluation progress, appeals and reviewer decisions.
- `ChecklistEditor.tsx`: immutable new versions with wording, weights, raw steps, scale meanings and N/A conditions.
- `ui.tsx` and `domain.ts`: reusable controls, accessible native dialogs, value/calendar semantics and run completion rules. Cancelled runs remain active until `finished_at` is recorded.
- `scripts/dev.sh`, `import_dev.py`, `export_results.py`: explicit single-owner startup, redacted source import, backend-validated baseline export.

The visual intent is an evidence review desk: navigation ink `#183b68`, action blue `#225bd3`, paper white `#ffffff`, workspace blue-grey `#f1f5fa`, source borders `#d9e2ed`, comparison green `#57a195`. System Segoe UI/Ubuntu/Cantarell keeps multilingual text local and readable; Georgia is confined to the small cq wordmark. The distinctive element is the paired source/evaluation inspection, with warm evidence highlights confined to actual cited turns. Quiet rules and spacing establish hierarchy; no external imagery or runtime font fetch is required. Tablet/mobile navigation collapses into a top bar; evidence stacks above assessment. Native dialogs provide focus containment and Escape dismissal, with visible keyboard outlines.

## API and data boundaries

All frontend requests use `/api`, proxied to `http://127.0.0.1:8000`. `CQA_API_TARGET` is a Vite server-only optional alternative. Backend credentials are never consumed by the frontend. React renders transcript and assistant content as escaped text. Recording controls load no media until requested; source recording links permit only HTTP(S).

The overview uses backend `/analytics` and `/conversations/search` for each active filter; frontend does not recalculate quality scores. Dates convert inclusive user end dates to exclusive next-day Almaty instants. Visible filter chips and interpretation expose calendar/holiday semantics. Every source link carries dataset plus original source ID. Original timestamps and source order remain unchanged.

Baseline analytics use `cqa-v1`; selecting another checklist in a conversation selects that version's latest evaluation. Saving a checklist does not evaluate it. Regular scores and custom judgments remain separate; boolean No, numeric zero, N/A and unknown have distinct displays. Custom coverage includes selected/assessed/applicable/N/A/failed/pending/cancelled/interrupted/uncovered and out-of-scope counts. Metric history displays every persisted run/item.

Reports are persisted by the backend, including drafts/errors/clarifications. Browser local storage retains the selected report ID and active conversation-run IDs, so an in-progress evaluation can be reopened without resending work. Normal product controls remain functional; external-call QA is a separately recorded operational authorization boundary.

## Startup and checks

See README for exact setup, prepared-runtime startup, import/export and test commands. `scripts/dev.sh` owns one API and one Vite child, refuses occupied ports/duplicate DB owners, has no reload/multiple workers, never sources `.env`, and never imports or evaluates on startup. Absolute database/lock/env paths preserve the prepared runtime when source checkouts change. A different test database is mandatory for backend tests.

Task 6 verification details, process ownership, browser evidence, limitations and deferred model interactions are recorded in the task report at `.superpowers/sdd/2026-11-07-cqa-prototype/task-6-report.md` (local coordination evidence, intentionally ignored). Backend suite result: 244 passed. Seven frontend domain/component tests and three CLI boundary tests pass; these use fictional API contracts and make no model requests. Browser QA is externally blocked because the enabled CUA surface fails before navigation, DOM reads and screenshots; no visual QA is claimed. Refer to the report for the final frontend build and browser QA evidence; real model UI interactions must not be inferred from compile or offline checks.
