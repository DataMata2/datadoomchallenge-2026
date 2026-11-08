# CQA conversation quality review

CQA helps a quality lead discover patterns in conversation quality, inspect original source evidence, and record review decisions. The React/TypeScript frontend includes a filtered overview, a saved assistant/report workspace, versioned checklists, individual evaluation progress, and criterion appeals with reviewer history.

The interface defaults to Russian and supports optional English/Kazakh selection, with locale-aware date/number formatting and the Asia/Almaty timezone. Analysis language is a separate durable workspace preference. The frontend uses a Freedom-inspired visual system with responsive navigation, searchable conversations, a dedicated analytics view, paired transcript/assessment review, and JSON import with a preview. The teammate’s evaluation, review, report, and checklist contracts are preserved. Its API adapter is independent of the visual components. See [the frontend handoff](docs/coordination/implementation/task-6-handoff.md), [the API contract](docs/api-contract.md), and [the confirmed product design](docs/coordination/product-discovery/product-design.md).

## Current server handoff — 2026-11-08

The private demonstration is live at **https://incode.kz:8443** with valid TLS and
whole-site authentication. The official team name is **404 Dauren Not Found**.
Credentials are recorded only in the ignored private `runtime/deploy/access.txt`;
keep their values and password hash out of source and shared logs. The GitHub
repository is now public at the user's request. The deployed website still requires
a login; public data/API access is pending the approval-review escalation. `freedom.incode.kz` DNS is currently unresolved; use the fallback.

The sole canonical database is
`89.126.193.108:/home/ubuntu/cqa/runtime/cqa.sqlite3`, owned by the single
`cqa-api` container. The local API/Vite owner is stopped and the former local
ledger is a mode-0440 archive. **Do not restart the old local owner, restore that
archive, or create a second live ledger.** Server release `9ded72e` is deployed,
including the final Freedom design changes; later documentation-only commits do
not imply another runtime release.

The verified cutover snapshot contains 78 conversations (DEV 65, FBroker 10,
Swap 3), 144 evaluations, 5 custom assessments, 5 reports, 6 runs and the unchanged
single `cqa-v1` checklist. DEV is 65/65 valid Russian baseline results in
`results/dev/results.json`; the primary FBroker control is 10/10 valid Russian
baseline results in `results/prod/results.json`. Swap is stored **ungraded**.
Recorded usage is **157 attempts / USD 2.409826 / zero reserved**. These are recorded
usage calculations, not invoice reconciliation. The full database logical hash
remained unchanged after startup:
`0c63e746fdc86b0fc753bba1ca4294cbfd7964890a037eb22cd56c47573246cf`.

Both private HTTP80 and fallback TLS443 routes were checked: missing/invalid
authentication returned 401 and valid authentication returned 200. Static assets,
deep SPA routes and migrated data integrity were checked. Browser visual and
interaction QA remains unavailable; HTTP/build checks do not establish it.

See [the current demo](docs/demo.md) and [deployment operations](docs/deployment.md) before operating the server.

## Isolated local development only

These commands create an isolated development workspace; they are not restart instructions for the deployed demonstration. Never point them at the archived pre-cutover ledger. Verified with Python 3.12, Node 25.8 and npm 11.11. Use Node 22.18 or newer for the frontend and its TypeScript test loader. The API is local and has no authentication. Keep it bound to loopback.

```bash
uv sync --project backend --locked
npm --prefix frontend ci
```

Use absolute paths for the database, model-job lock and optional backend secret file. `CQA_ENV_FILE` is read by the backend; the script never executes it as shell code. No provider credential belongs in a `VITE_*` variable. Omit `CQA_ENV_FILE` from the launch command when no backend secret file exists. Read-only analysis works without a provider key; deliberately starting an assistant request or assessment requires backend credentials.

```bash
cqa_project="$PWD"
CQA_ENV_FILE="$cqa_project/.env" \
CQA_DATABASE_PATH="$cqa_project/runtime/dev-sandbox.sqlite3" \
CQA_MODEL_LOCK="$cqa_project/runtime/dev-sandbox-model-jobs.lock" \
bash scripts/dev.sh
```

Open <http://127.0.0.1:5173>. The Vite proxy sends `/api` to the single API at <http://127.0.0.1:8000>; interactive API documentation is at <http://127.0.0.1:8000/docs>. The startup script works with the default macOS Bash 3.2 and on Linux. A Python standard-library supervisor manages the owner lock, readiness, signals and both child processes; no `flock` command or Bash `wait -n` is required. The startup script prints owner/backend/frontend PIDs. Stop that owner with Ctrl+C; it stops both children. It refuses occupied ports or a second script owner for the same database. Do not start another API process, use Uvicorn reload, or launch multiple workers against the live database. Startup recovers unfinished work without resending requests, so wait for in-flight work before replacing the owner.

The prepared demonstration now runs only on the server. Local startup performs no import, evaluation, reset or model request, but an empty isolated workspace does not contain the deployed results. The frontend uses no external runtime fonts or images.

## Interface languages

Use the language selector in the top bar or an open dialog to switch between **Русский**, **English** and **Қазақша**. Russian is the default. The preference is saved in this browser; the selected language also controls interface date formatting and document language. Switching does not refetch data, evaluate conversations, save forms or clear drafts.

Localization covers navigation, forms, statuses, validation messages, score explanations and baseline criterion descriptions. Original RU/KZ/EN transcript text, source timestamps, IDs, AI rationales, comments and user-authored content are preserved. Built-in cqa-v1 drafts start from localized display copies; user-defined versions retain their own wording. Switching interface language preserves the current draft and never rewrites stored checklists. API enum values and the separate conversation-language filter are unchanged.

## Import conversations through the interface

Choose **Загрузить диалоги** from any workspace screen. Select or drop a JSON file (up to 20 MB), or choose **Вставить JSON**. The interface accepts the organizer response envelope, an array of source conversations, or one source conversation object. A single object/array uses the entered dataset ID; an organizer response retains its own `dataset_group_id`.

Preview the conversation count, channels, languages and source IDs, then import. The frontend calls the existing `POST /api/datasets/import` contract. The backend validates timestamps and the complete dataset atomically, rejects conflicts, and treats identical reimports as idempotent. Import does not evaluate, call the model, or replace existing assessments. After success, **Открыть набор** selects the imported dataset and clears previous filters so the new conversations are visible.

Original IDs, text, roles and timestamps stay intact. Optional October 2026 demonstration dates are **off by default** and are separate from original timestamps. For source-only data, use all dates rather than filtering by a demonstration calendar.

For a Mac without `uv`, a Python 3.12 installation can also prepare the backend:

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -e ./backend
npm --prefix frontend ci
CQA_DATABASE_PATH="$PWD/runtime/dev-sandbox.sqlite3" \
CQA_MODEL_LOCK="$PWD/runtime/dev-sandbox-model-jobs.lock" bash scripts/dev.sh
```

## Import into an isolated development workspace

The delivered DEV and FBroker datasets are already imported and assessed. Do not replay an import or evaluation against the server or old local archive. The following helper examples apply only to a deliberately isolated development workspace. Run its API first. Import a user-supplied local organizer envelope, keeping raw material in an ignored directory:

```bash
python3 scripts/import_dev.py --source docs/coordination/implementation/evidence/dev.json --group DEV
```

Alternatively, set `CQA_DEV_SOURCE_URL` in the process environment or an ignored backend env file, then run:

```bash
python3 scripts/import_dev.py --env-file /absolute/path/to/ignored/.env --group DEV
```

The helper reads only the named URL assignment and never prints it. The backend validates the complete envelope atomically. Identical reimports are idempotent; conflicting source records reject. Import does not start model evaluation. Use `--source-dates-only` only when assigned demo dates are intentionally unwanted. Never commit raw payloads, recordings, signed URLs, credentials, or runtime databases.

## Analysis language and Russian interface

Open **Настройки** → **Язык анализа**. The server preference defaults to **Русский (RU)**; **Казахский (KZ)** and **Английский (EN)** are also supported. Select a language and choose **Сохранить настройки**. The screen reads `GET /api/settings` and saves exactly `POST /api/settings` with `{"analysis_language":"RU"}` (or `KZ`/`EN`). Loading, saving, saved confirmation and API failures are visible. Reopening the screen loads the server value; this preference is not browser-only storage.

The saved language applies to new evaluations, custom-metric runs and assistant replies. Saving a preference makes no provider request, launches no assessment and does not change queued work or stored results. Existing model-authored records without language metadata are labeled English. Conversation assessment provenance, run progress and assistant messages show the language recorded for that output. The overview's **Язык диалога** filter selects the source language independently; it does not set the analysis language.

Product labels, known calendar/group metadata, baseline criterion wording and editable baseline drafts are displayed in Russian. Original transcripts, timestamps, user-entered report/criterion/metric text and model output remain verbatim. Built-in wording uses display copies; immutable `cqa-v1` is preserved. Unknown errors/metadata stay inspectable. Changing the analysis language does not change the separate browser interface-language preference.

## Review and analysis

The overview defaults to an available assigned period, explicitly showing Asia/Almaty. Calendar predicates use assigned demo timestamps, separate from immutable original transcript timestamps and independent of quality scores. Filters cover channel, language, dates, local day/night hours, observed Kazakhstan public holidays, weekdays, quality score and critical flags. Each aggregate exposes its eligible denominator and N/A treatment; select a measure or comparison bar to inspect actual source conversations.

Save an overview selection as a report, or use the assistant to request a report with an explicit period such as **October 2026**. Saved report selection persists in this browser. Reports retain message history, filter interpretation and source drilldown. Custom metrics have separate definitions, coverage, progress, results and evidence. They never change the regular quality score or baseline export. Pending, failed, interrupted, cancelled, N/A and uncovered results remain distinct.

A conversation shows every original turn with one-based evidence links, original/final scores, applicable weight and raw/weighted criterion calculations. Checklist edits save a new version; select that version in a conversation before explicitly evaluating it. Appeal and reviewer forms preserve original assessments, comments, reasons and recalculated final results. A critical flag remains separate from the arithmetic total.

The paid baseline model is **`claude-sonnet-5-5`**. One complete assessment uses one request containing the full original numbered transcript and the complete selected checklist; the backend calculates the scores. The original 65-record DEV bulk run recorded 65 successful requests costing **USD 0.988380**, a mean of about **USD 0.0152 per complete assessment** (0.988380 ÷ 65). This historical token-usage estimate excludes extra smoke, assistant, custom-metric and retry work. The historical [recorded usage](docs/coordination/implementation/ledger.md) snapshot before Russian preparation totals USD 1.061508 across 73 attempts with zero reserved, including extra checks and retained rejections. Read the latest ledger and `/api/usage` for subsequent authorized work. These are recorded usage calculations, not invoice reconciliation or a future pricing guarantee.

## Delivered results and demonstration

The committed primary artifacts are [DEV 65/65 Russian results](results/dev/results.json)
and [FBroker 10/10 Russian control results](results/prod/results.json), using team
`404 Dauren Not Found`, actual model `claude-sonnet-5-5` and immutable `cqa-v1`.
Swap has no assessment/export claim. Do not regenerate these artifacts as an
incidental demonstration step. Export is read-only, while evaluation and assistant
requests can incur new usage and require the existing coordination workflow.

See [the current server demonstration](docs/demo.md) for a read-only walkthrough,
followed by clearly labeled historical English provenance. The real FBroker
control source has been processed; earlier statements that control was unavailable
are historical. GitHub publication is now explicitly authorized and the repository is public. Website authentication remains enabled pending resolution of the public-data access approval.

The [presentation comparison](docs/presentation-model-comparison.md) records the
separate local-model experiment and its limits. It does not claim gold-label
accuracy or a controlled speed advantage. Browser visual/interaction QA remains
unavailable; valid TLS, authentication, static/deep-route HTTP checks and data
integrity have been verified for the deployed server.

## Troubleshooting

- Occupied port/duplicate-owner refusal: contact the deployment owner. The sole live owner is server container `cqa-api`; do not restart the archived local workspace or launch a second database owner.
- Missing prepared data: confirm the server canonical path `/home/ubuntu/cqa/runtime/cqa.sqlite3`; do not create a new empty runtime or restore the old local archive.
- Polling interrupted: `scripts/evaluate_results.py --resume` uses its saved run ID. Inspect an unknown dispatch outcome before choosing another state file; the helper does not automatically resend.
- Failed model action: inspect canonical `/api/usage` and run/item errors before any explicit retry. Preserve unknown-outcome reservations and all paid attempts. A provider HTTP 400 requires contract investigation.
- Export validation failure: use the exact dataset/count/official team name, complete its unchanged cqa-v1 baseline, then explicitly export again. Independent custom metrics and other checklist versions are excluded from baseline export.

## Checks

```bash
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run format:check
backend/.venv/bin/python -m unittest discover -s scripts -p 'test_*.py'
CQA_DATABASE_PATH="$PWD/runtime/test-checks.sqlite3" \
  backend/.venv/bin/python -m pytest -q backend/tests
```

Run backend tests with a separate ignored database, preserving the live ledger. After an API schema change, run `npm --prefix frontend run generate:types` followed by `npm --prefix frontend run format`. Do not start paid model requests as an incidental test or startup check.
