# Implementation readiness

Date: 2026-11-07, Asia/Almaty. Worker: `/root/implementation_readiness`.
Scope: bounded technical fact-finding for the overseer; no implementation.
Branch: none; worktree: `/home/datamata/Projects/hackathons/datadoomchallenge-2026`.
Requirements: `../product-discovery/product-design.md` and `../materials-review/briefing.md`.

## Recommendation

Use the installed Python 3.12.13 explicitly, FastAPI with Pydantic 2, standard-library SQLite in rollback-journal mode, and one backend process. Use Anthropic's Python SDK on the backend. Build the functional prototype with React, TypeScript, and Vite; publish the OpenAPI contract and sample JSON early so the teammate's frontend remains independent. Store immutable source transcripts, checklist versions, evaluations, appeals/reviews, analysis runs, and provider usage separately. Keep scoring and export validation deterministic.

Recommend `claude-sonnet-5-5` consistently for evaluation and assistant requests, subject to authenticated model-list and small smoke-test success. Current official documentation identifies it as active/latest, with text/image input, 1M context, 128K maximum output, and USD 2 per million input tokens / USD 10 per million output tokens. Account access is **not verified**. This is a published available model identifier, not evidence that the project's credential can use it. [Official Sonnet 5.5 model page](https://platform.claude.com/docs/en/models/sonnet-5-5/overview).

Low-cost alternative: `claude-haiku-5-5`, documented active/latest. For prompts up to 100,000 tokens, the published rates are USD 0.10 input / USD 0.50 output per million tokens; above that threshold both rates increase to USD 0.50 / USD 2.50. Select it only after reviewing a multilingual sample against the checklist; lower price is verified, evaluation quality is unmeasured. Do not silently mix models within a recorded run. [Official Haiku 5.5 model page](https://platform.claude.com/docs/en/models/haiku-5-5/overview).

## Verified local baseline

Read-only commands were executed in the project directory. The prior report is `../product-discovery/runtime-feasibility.md`.

| Item | Current evidence |
| --- | --- |
| Python | `/home/datamata/.local/share/uv/python/cpython-3.12.13-linux-x86_64-gnu/bin/python3.12` executes successfully; 3.12.13 |
| SQLite | That Python imports `sqlite3` and reports 3.50.4 |
| Python dependencies | Metadata reports FastAPI, Uvicorn, HTTPX, Anthropic, Pydantic, python-dotenv, Torch, Transformers, Hugging Face Hub, and NumPy absent in this Python |
| Node/npm | Default 25.8.0 / 11.11.0; explicit installed Node 22.23.2 / npm 10.9.8 execute successfully |
| uv/flock | uv 0.10.9; `/usr/bin/flock` available |
| Git | `git status --short --branch` still reports not a repository at the sample; no branch available |
| RAM | `free -h`: 14 GiB total, about 5.0 GiB available, 3.7 GiB swap used at the sample |
| Cached text model | Qwen2.5-1.5B-Instruct snapshot `989aa7980e4cf806f80c7fef2b1adb7bc71aa306`: 3,087,467,144-byte safetensors plus config/tokenizer files; weights were not loaded |

A standard approved sandbox escalation performed only read-only GPU/service checks. `nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv,noheader` succeeded: RTX 3060 Laptop GPU, **6144 MiB total / 5855 MiB free**, driver 615.78.08. `systemctl show ollama.service` returned inactive/dead and `/etc/systemd/system/ollama.service`. GETs to localhost port 11434 `/api/version`, `/api/tags`, and `/api/ps` returned connection refused. Thus GPU management access is established, while a running Ollama service, installed Ollama model, framework execution, latency, and quality remain unverified.

The claude-project-context helper found no scoped project/ancestor Claude instructions and no exact-project memory index. Available ancestor indexes contained no relevant model-job lock pointer. The bounded project Markdown search for `flock`, shared locks, and model locks found only earlier statements that the path is unknown. **No existing shared model-job lock path was established.** Do not invent a path and claim it coordinates other projects; route this prerequisite to the overseer before a local model job.

`uv python list --only-installed` failed because uv attempted to create a temporary file in its read-only default cache. Direct interpreter execution succeeded. Use a project-local `UV_CACHE_DIR` during installation. The credential file was not read again: the prior verified finding remains that `.env` is nonstandard and must be normalized safely before conventional loading. No credential was printed.

## Concrete bootstrap and launch commands

These are recommended worker commands, **not executed by this discovery worker**. They assume the worker creates `backend/app/main.py` with `app` and a `/api` prefix. Use an ignored project cache, virtual environment, database, and secrets file.

```bash
cd /home/datamata/Projects/hackathons/datadoomchallenge-2026
export UV_CACHE_DIR="$PWD/.cache/uv"
uv venv --python /home/datamata/.local/share/uv/python/cpython-3.12.13-linux-x86_64-gnu/bin/python3.12 .venv
uv pip install --python .venv/bin/python fastapi==0.162.2 pydantic==2.14.3 uvicorn==0.54.0 anthropic==2.6.0 httpx==0.28.1 'python-dotenv>=1,<2'
uv pip freeze --python .venv/bin/python > requirements.lock.txt
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --env-file .env
```

Package versions above were checked against current PyPI release pages: [FastAPI 0.162.2](https://pypi.org/project/fastapi/), [Pydantic 2.14.3](https://pypi.org/project/pydantic/), [Uvicorn 0.54.0](https://pypi.org/project/uvicorn/), [Anthropic 2.6.0](https://pypi.org/project/anthropic/), and [HTTPX 0.28.1](https://pypi.org/project/httpx/). Installation/resolution compatibility was not exercised. The published Anthropic package requires Python >=3.10 and Pydantic <3; it now depends on **HTTPX2**, so an injected HTTPX 0.x client is not interchangeable with its HTTP client. Keep HTTPX 0.28.1 only for application imports/tests if needed. [Official SDK package definition](https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/pyproject.toml).

FastAPI's official server example uses `uvicorn module:app`; the command above intentionally launches one process. Add `--reload` only for interactive development; do not start model runs at module import. [Server documentation](https://fastapi.tiangolo.com/deployment/manually/).

```bash
export PATH="/home/datamata/.local/share/mise/installs/node/22.23.2/bin:$PATH"
npm create vite@latest frontend -- --template react-ts --no-interactive
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
npm run build
```

The official Vite guide supports `react-ts`, `--no-interactive`, and requires Node 20.19+ or 22.12+; the explicit local Node satisfies this. Commit the generated package lock and subsequently use `npm ci`. Do not infer released npm template versions from GitHub `main`; the actual resolved versions must be recorded after installation. [Vite guide](https://vite.dev/guide/).

Proxy `/api` from Vite to `http://127.0.0.1:8000` without stripping the prefix. For a separately served teammate UI, configure explicit permitted origins. Never put the Anthropic secret in a `VITE_*` variable: Vite exposes these in browser bundles. [Proxy documentation](https://vite.dev/config/server-options), [FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/), [Vite environment documentation](https://vite.dev/guide/env-and-mode).

## One recommended provider request contract

Use `AsyncAnthropic`, SDK **2.6.0**, with explicit timeout and application-managed retry accounting. SDK 2.x uses API **2026-10-21**. Omit `temperature`, `top_p`, and `top_k`; this API version rejects them. Default SDK behavior retries selected errors twice and waits up to ten minutes, so use `max_retries=0` and a bounded timeout when the application owns attempts. [SDK documentation](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/python), [API migration](https://platform.claude.com/docs/en/api/migration-2026-10-21).

For each conversation, request all criterion judgments once; send the complete transcript with stable one-based turn indices and the selected checklist definition. Require short assessment rationale and evidence/checked-region indices, not hidden reasoning. Do not ask the model to calculate the official total. Record a schema version, checklist version, prompt version, and exact model with each run.

```python
from anthropic import AsyncAnthropic, transform_schema

client = AsyncAnthropic(max_retries=0, timeout=90.0)
response = await client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=4096,
    thinking={"type": "between_tools"},
    system=evaluation_instructions,
    messages=[{"role": "user", "content": serialized_evaluation_input}],
    output_config={
        "effort": "medium",
        "format": {"type": "json_schema", "schema": transform_schema(Evaluation)},
    },
)
```

`Evaluation` denotes the worker's Pydantic output model. Native JSON output uses `output_config.format`; objects require `additionalProperties: false`. SDK schema transformation can remove numeric/string bounds from the transmitted grammar, so validate the received JSON against the original Pydantic model and task-specific invariants. Capture usage before parsing so validation failures retain their cost. Reject truncated, refused, absent, or semantically invalid results. The current docs describe both refusal stop reasons and refusal stop details: retain both raw fields. [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Messages reference](https://platform.claude.com/docs/en/api/messages/create).

Sonnet 5.5 rejects `thinking: {"type": "disabled"}` and forced `tool_choice` values `any`/`tool`. `between_tools` suppresses up-front thinking at medium effort without a beta header; without tools this yields text output. This recommendation deliberately uses native JSON for evaluations rather than a forced submission tool. [Sonnet 5.5 changes](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5).

For the assistant, use the same model with `tool_choice: {"type": "auto"}` and a small allowlist of application tools. Mark tool definitions `strict: true`, with `name`, `description`, and `input_schema`. Validate filters and execute registered functions server-side. Return every `tool_use` result immediately in a following user `tool_result` block matching its ID; preserve the entire assistant content, including thinking blocks. Cap the loop, for example at four provider calls per user request. [Strict tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use), [Tool results](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls).

## Usage and budget guard

Persist every provider attempt before sending it: request/run identity, purpose, model, limits, start/end time, latency, provider request/message ID, status, raw usage, and versioned USD rates. Store `input_tokens`, `output_tokens`, cache creation/read counts, and cache lifetime details when present. Thinking is already included in output usage; do not count it twice. Avoid caching and paid server tools initially to keep billing simple. Count every assistant round trip and failed/retried evaluation in per-evaluation costs.

For ordinary uncached Sonnet requests, calculate USD as `(2 * input_tokens + 10 * output_tokens) / 1_000_000`. Cache/tokenizer/feature pricing differs; retain raw usage for reconciliation. [Official pricing](https://platform.claude.com/docs/en/about-claude/pricing).

**Estimate, not measurement:** at 5,000 input and 2,000 output tokens per evaluation, Sonnet costs USD 0.030 each, USD 1.95 for 65 DEV, or USD 2.25 for 75 DEV+control. At 10,000 input and the 4,096 output ceiling, 75 evaluations cost at most USD 4.572 under those assumed input counts. These exclude assistant, repeats, and additional metrics. The same 5k/2k example costs USD 0.0015 on Haiku's short-prompt tier. Actual multilingual token counts and quality remain unmeasured.

Recommendation: reserve USD 20 of the USD 100 cap for control/recovery; run DEV and assistant work under an USD 80 allowance. Enforce the cap atomically in SQLite by reserving funds before each request, retaining reservations for unknown-outcome timeouts, and reconciling completed requests from returned usage. Serialize initial calls. Input token counting is free but is an estimate; it is useful preflight, not measured billed usage. A strict conservative reservation can use the model's 1M input-context upper bound plus `max_tokens` output, rather than assuming a token estimate is an exact billing bound. Stop when the remaining allowance cannot fund the next reservation. [Token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting).

## SQLite and execution pitfalls

Python 3.12 exposes explicit `autocommit`; choose transaction behavior deliberately, commit/rollback explicitly, and close connections. The default connection is restricted to its creating thread; sharing it with FastAPI worker threads needs care. Use short connections/transactions and serialize writes, with no transaction held during provider requests. [Python 3.12 sqlite3](https://docs.python.org/3.12/library/sqlite3.html).

Keep rollback journal on this machine. Its bundled SQLite **3.50.4** predates the WAL-reset fix; SQLite documents a rare concurrent WAL write/checkpoint race fixed in 3.51.3 and backported to 3.50.7/3.44.6. WAL is optional for 65 records; avoid adding a dependency upgrade solely for it. [SQLite's WAL documentation](https://sqlite.org/wal.html).

## Unknowns and not checked

- Credential validity, balance, permitted models, authenticated model listing, cloud connectivity/rate limits, and smoke evaluation are unverified; no paid inference or token-count request was made.
- No packages were installed, dependency resolution run, models downloaded/loaded, services started, configuration changed, or source code written. Only this owned report was created.
- No local inference performance or quality claim is established. Qwen is a cached candidate, not a working Ollama model; conversion/loading must be a separately scoped experiment with the confirmed shared lock.
- No frontend/browser compatibility test, backend startup, database write, audio playback, holiday calendar verification, or complete export was tested here.
- No Git initialization, commit, push, publication, or change to the public/private status of an artifact occurred.

Next action for the overseer: approve the stack/defaults as engineering decisions, dispatch bootstrap/provider workers, require an authenticated model-list and one measured schema-valid multilingual smoke result before bulk runs, and keep local comparison off the critical path until its lock and runtime are established.
