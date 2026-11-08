# CQA conversation quality review

CQA helps a quality lead discover patterns in conversation quality, inspect original source evidence, and record review decisions. The local React/TypeScript frontend includes a filtered overview, a saved assistant/report workspace, versioned checklists, individual evaluation progress, and criterion appeals with reviewer history.

The interface is Russian, with Russian date/number formatting and the Asia/Almaty timezone. Analysis language is a separate durable workspace preference. The frontend uses a Freedom-inspired visual system with responsive navigation, searchable conversations, a dedicated analytics view, paired transcript/assessment review, and JSON import with a preview. The teammate’s evaluation, review, report, and checklist contracts are preserved. Its API adapter is independent of the visual components. See [the frontend handoff](docs/coordination/implementation/task-6-handoff.md), [the API contract](docs/api-contract.md), and [the confirmed product design](docs/coordination/product-discovery/product-design.md).

## Install and start locally

Verified with Python 3.12, Node 25.8 and npm 11.11. Use Node 22.18 or newer for the frontend and its TypeScript test loader. The API is local and has no authentication. Keep it bound to loopback.

```bash
uv sync --project backend --locked
npm --prefix frontend ci
```

Use absolute paths for the database, model-job lock and optional backend secret file. `CQA_ENV_FILE` is read by the backend; the script never executes it as shell code. No provider credential belongs in a `VITE_*` variable. Omit `CQA_ENV_FILE` from the launch command when no backend secret file exists. Read-only analysis works without a provider key; deliberately starting an assistant request or assessment requires backend credentials.

```bash
cqa_project="$PWD"
CQA_ENV_FILE="$cqa_project/.env" \
CQA_DATABASE_PATH="$cqa_project/runtime/cqa.sqlite3" \
CQA_MODEL_LOCK="$cqa_project/runtime/model-jobs.lock" \
bash scripts/dev.sh
```

Open <http://127.0.0.1:5173>. The Vite proxy sends `/api` to the single API at <http://127.0.0.1:8000>; interactive API documentation is at <http://127.0.0.1:8000/docs>. The startup script works with the default macOS Bash 3.2 and on Linux. A Python standard-library supervisor manages the owner lock, readiness, signals and both child processes; no `flock` command or Bash `wait -n` is required. The startup script prints owner/backend/frontend PIDs. Stop that owner with Ctrl+C; it stops both children. It refuses occupied ports or a second script owner for the same database. Do not start another API process, use Uvicorn reload, or launch multiple workers against the live database. Startup recovers unfinished work without resending requests, so wait for in-flight work before replacing the owner.

For the current prepared demonstration, preserve the existing canonical runtime and original backend secret file even if launching from another source checkout:

```bash
cqa_active=/home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026
cqa_original=/home/datamata/Projects/hackathons/datadoomchallenge-2026
cd "$cqa_active"
CQA_ENV_FILE="$cqa_original/.env" \
CQA_DATABASE_PATH="$cqa_active/runtime/cqa.sqlite3" \
CQA_MODEL_LOCK="$cqa_active/runtime/model-jobs.lock" \
bash scripts/dev.sh
```

Reuse an already running pair. Startup performs no import, evaluation, reset, or model request. The frontend uses no external runtime fonts or images.

## Import conversations through the interface

Choose **Импортировать диалоги** from any workspace screen. Select or drop a JSON file (up to 20 MB), or choose **Вставить JSON**. The interface accepts the organizer response envelope, an array of source conversations, or one source conversation object. A single object/array uses the entered dataset ID; an organizer response retains its own `dataset_group_id`.

Preview the conversation count, channels, languages and source IDs, then import. The frontend calls the existing `POST /api/datasets/import` contract. The backend validates timestamps and the complete dataset atomically, rejects conflicts, and treats identical reimports as idempotent. Import does not evaluate, call the model, or replace existing assessments. After success, **Открыть набор данных** selects the imported dataset and clears previous filters so the new conversations are visible.

Original IDs, text, roles and timestamps stay intact. Optional October 2026 demonstration dates are **off by default** and are separate from original timestamps. For source-only data, use all dates rather than filtering by a demonstration calendar.

For a Mac without `uv`, a Python 3.12 installation can also prepare the backend:

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -e ./backend
npm --prefix frontend ci
bash scripts/dev.sh
```

## Import local DEV data

Run the API first. Import a user-supplied local organizer envelope, keeping raw material in an ignored directory:

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

Product labels, known calendar/group metadata, baseline criterion wording and editable baseline drafts are displayed in Russian. Original transcripts, timestamps, user-entered report/criterion/metric text and model output remain verbatim. Built-in wording uses display copies; immutable `cqa-v1` is preserved. Unknown errors/metadata stay inspectable. The interface stays Russian when a different analysis language is saved.

## Review and analysis

The overview defaults to an available assigned period, explicitly showing Asia/Almaty. Calendar predicates use assigned demo timestamps, separate from immutable original transcript timestamps and independent of quality scores. Filters cover channel, language, dates, local day/night hours, observed Kazakhstan public holidays, weekdays, quality score and critical flags. Each aggregate exposes its eligible denominator and N/A treatment; select a measure or comparison bar to inspect actual source conversations.

Save an overview selection as a report, or use the assistant to request a report with an explicit period such as **October 2026**. Saved report selection persists in this browser. Reports retain message history, filter interpretation and source drilldown. Custom metrics have separate definitions, coverage, progress, results and evidence. They never change the regular quality score or baseline export. Pending, failed, interrupted, cancelled, N/A and uncovered results remain distinct.

A conversation shows every original turn with one-based evidence links, original/final scores, applicable weight and raw/weighted criterion calculations. Checklist edits save a new version; select that version in a conversation before explicitly evaluating it. Appeal and reviewer forms preserve original assessments, comments, reasons and recalculated final results. A critical flag remains separate from the arithmetic total.

The paid baseline model is **`claude-sonnet-5-5`**. One complete assessment uses one request containing the full original numbered transcript and the complete selected checklist; the backend calculates the scores. The original 65-record DEV bulk run recorded 65 successful requests costing **USD 0.988380**, a mean of about **USD 0.0152 per complete assessment** (0.988380 ÷ 65). This historical token-usage estimate excludes extra smoke, assistant, custom-metric and retry work. The historical [recorded usage](docs/coordination/implementation/ledger.md) snapshot before Russian preparation totals USD 1.061508 across 73 attempts with zero reserved, including extra checks and retained rejections. Read the latest ledger and `/api/usage` for subsequent authorized work. These are recorded usage calculations, not invoice reconciliation or a future pricing guarantee.

## Export evaluated results

Exports are read-only and always use the prescribed `cqa-v1` checklist. The backend rejects missing evaluations or invalid source evidence rather than fabricating a result. Supply the official team name explicitly:

```bash
python3 scripts/export_results.py --dataset DEV \
  --team-name '404 Dauren Not Found' --output results/dev/results.json
```

For the real ten-record control dataset, use its actual dataset ID and `results/prod/results.json`. A synthetic control fixture is not a submission. Export does not evaluate or refresh anything; only write an official result after the source dataset is available and assessed. Publication and public repository visibility remain separate user decisions.

## Demonstration and control handoff

See [the reproducible demo and control workflow](docs/demo.md) for prepared source/evaluation/report IDs, ready model prompts, read-only HTTP/export checks and the exact import → evaluate/resume → validate/export sequence for the real ten-record control source when released. [The presentation comparison](docs/presentation-model-comparison.md) records the initial import failure, verified packaging correction, five local outcomes and their limits; it does not claim gold-label accuracy or a controlled speed advantage.

Verification limits: Russian UI/settings checks use synthetic components, type checking and a production build; they do not establish visual browser acceptance. The earlier Freedom UI browser check used historical DEV results in a disposable database. The overseer records the separately authorized Russian DEV preparation and live acceptance in the coordination ledger; do not infer new-run scores or usage from the historical examples. Two wholly fictional assistant actions and one fictional custom judgment passed native-provider acceptance after a compact transport fix; the earlier two rejected attempts remain in billing history. Retained DEV read/analysis/export works. These fictional checks do not establish a complete live DEV model workflow.

## Troubleshooting

- Occupied port/duplicate-owner refusal: reuse the known owner or stop it gracefully and wait for its children. Do not kill an unidentified process or start a second database owner.
- Missing prepared data: check `CQA_DATABASE_PATH` is the absolute canonical active runtime, rather than creating another relative runtime.
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
