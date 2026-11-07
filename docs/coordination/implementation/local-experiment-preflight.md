# Presentation-only local-model preflight

Date: 2026-11-08 00:59 Asia/Almaty. Worker: `/root/local_experiment_preflight`.
Read-only target: `/home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026`, branch `feat/cqa-prototype`, HEAD `f2c0c96713138e3881da66f4a433efe4bc4ad241`. Task 5 edits were in progress; none were changed. This report is the only file written, in the original project root.

## Decision

Recommend the installed **Ollama 0.34.0 normal Safetensors import**, with an owned loopback server and ignored project model store. This avoids adding the absent PyTorch/Transformers stack. The cached model directory is structurally complete and this installed release contains the Qwen2 converter. Conversion, schema support for this precise schema, CUDA execution, fit, latency, and grading quality remain **unmeasured**. Make one time-limited attempt in Task 7; failure is a valid presentation result and must not delay mandatory workflows. No product provider/comparison API is needed.

The minimum comparison client is the existing Python 3.12 backend interpreter, standard-library `sqlite3`/`urllib.request`, and its installed Pydantic/jsonschema validators. Do not construct `Store`, `Evaluator`, `Budget`, `ModelClient`, or the FastAPI app: `Store` initialization writes database metadata, and evaluator/provider paths save assessments or send paid requests (`storage.py:16–24`, `evaluations.py:56–90`, `provider.py:124–184`). Reuse pure prompt/schema/scoring definitions only.

## Measured readiness

| Item | Evidence and implication |
| --- | --- |
| GPU | Approved host read: NVIDIA RTX 3060 Laptop, 6,144 MiB total, 5,855 MiB free, driver 615.78.08. Management access succeeds; CUDA inference was not tested. |
| Host memory | `free -m`: 15,309 MiB total; 6,607 MiB available; 4,690 MiB swap already used. Sample only; serialize conversion, model jobs, and heavy tests. |
| Runtime | `/usr/local/bin/ollama`, 40,014,640 bytes; client 0.34.0; service inactive/dead. `ollama create --help` exposes normal `-f`/`--quantize` and a separate `--experimental` path. Use the normal path. Binary contains `convert.qwen2Model`. |
| GPU libraries | `/usr/local/lib/ollama/cuda_v12` and `cuda_v13` contain `libggml-cuda`, CUDA runtime and cuBLAS libraries; bundled CPU and llama libraries also exist. Presence does not prove loading. |
| Backend | Python 3.12.13; Pydantic 2.14.3; jsonschema 4.26.0; Anthropic 2.6.0. Metadata reports Torch, Transformers, Accelerate, Safetensors, Tokenizers, Hugging Face Hub, NumPy, SentencePiece, llama-cpp-python, vLLM, and bitsandbytes absent. |
| Lock | Active checkout `runtime/model-jobs.lock` exists. `cqa.prepare.model_job_lock` uses nonblocking exclusive `fcntl.flock` (`prepare.py:19–30`). This is project-only; normal application jobs do not necessarily take it. Stop application model work and coordinate with the overseer before the experiment. |

Cache directory: `/home/datamata/.cache/huggingface/hub/models--Qwen--Qwen2.5-1.5B-Instruct/snapshots/989aa7980e4cf806f80c7fef2b1adb7bc71aa306`.

- `model.safetensors`: **3,087,467,144 bytes**, approximately 2.875 GiB. All snapshot symlinks resolve; no weight data were loaded or hashed. The filename of the resolved cache blob is not an independently verified integrity hash.
- Present: `config.json`, `generation_config.json`, `tokenizer.json`, `tokenizer_config.json`, `vocab.json`, `merges.txt`, license/model card. Config: `Qwen2ForCausalLM`, bfloat16, hidden size 1,536, 28 layers, 12 query heads, two KV heads, vocabulary 151,936, tied embeddings, context 32,768. Ignore tokenizer metadata's larger 131,072 limit for this experiment.
- Tokenizer: BPE, 151,643 vocabulary entries, 22 added tokens, 151,387 merges; split-regex SHA-256 `1ff7f41064896984db5d1bb6ff64fa4bc29007d08c1b439e505b7392777a319e`. The release converter recognizes this exact Qwen2 pretokenizer digest. Its tokenizer parser reads the present tokenizer/config/generation files; its CLI resolves symlinks during blob import. These checks establish a viable candidate directory, not successful conversion. [Release converter registry](https://raw.githubusercontent.com/ollama/ollama/v0.34.0/convert/convert.go), [tokenizer parser](https://raw.githubusercontent.com/ollama/ollama/v0.34.0/convert/tokenizer.go), [CLI import implementation](https://raw.githubusercontent.com/ollama/ollama/v0.34.0/cmd/cmd.go).

**Estimated memory, not a measurement:** an unquantized converted model is approximately 2.9 GiB. At batch/concurrency one, a 16,384-token FP16 KV cache is approximately `28 layers × 2 (K,V) × 2 KV heads × 128 head dimensions × 2 bytes × 16,384 = 448 MiB`. Runtime workspace and conversion transients are additional and unmeasured. Expected GPU demand is plausibly within the sampled free 5.7 GiB, but reserve headroom and stop on OOM; do not enable 32K/128K context or concurrent requests. Conversion can pressure system RAM even if GPU inference fits. The model card confirms the 32,768 context and 8,192 generation limit. [Official model card](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct).

## Owned server and necessary setup

`OLLAMA_MODELS` isolates model artifacts; it does **not** isolate the app identity. In release `cmd/cmd.go:1889–1947`, `RunServer` calls `initializeKeypair` before binding. When absent, that function generates Ed25519 locally, creates `~/.ollama`, writes `id_ed25519` mode 0600 and `.pub` mode 0644, and prints the public key. It contains no network request, account login, or upload. An existence-only check found the default private-key file absent; no identity contents were read. Therefore first startup would create these ordinary reversible identity files. The overseer can include that concrete side effect in the authorized runtime setup; this report does not create an additional user approval gate. Do not override `HOME`, change systemd configuration, log in, pull a model, or publish anything. [Exact release startup code](https://raw.githubusercontent.com/ollama/ollama/v0.34.0/cmd/cmd.go).

For the future run, bind `127.0.0.1:11435`, set `OLLAMA_NO_CLOUD=1`, `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, and a project-only `OLLAMA_MODELS`. Installed `serve --help` verifies these options. Cloud disabling is documented; it does not independently prove all possible outbound traffic is blocked. The proposed local import/API sequence has no remote model reference. Ordinary sandbox escalation may be needed for the host runtime and app identity writes. [Official local-only setting](https://docs.ollama.com/faq).

Proposed commands below are **not executed**. Hold the same lock continuously across server startup, import, inference and cleanup; the future Task 7 harness should own server PID cleanup and a 15-minute total deadline. Start only if the chosen port is unused. Its startup log and all experiment artifacts belong in ignored `runtime/local-comparison/`.

```bash
set -euo pipefail
cd /home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026
mkdir -p runtime/local-comparison/models
exec 9>runtime/model-jobs.lock
flock -n 9
python3 - <<'PORTCHECK'
import socket
with socket.socket() as probe:
    probe.bind(("127.0.0.1", 11435))
PORTCHECK
export OLLAMA_HOST=127.0.0.1:11435
export OLLAMA_MODELS="$PWD/runtime/local-comparison/models"
export OLLAMA_NO_CLOUD=1 OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_CONTEXT_LENGTH=16384 OLLAMA_LOAD_TIMEOUT=90s
ollama serve >runtime/local-comparison/server.log 2>&1 &
local_server_pid=$!
trap 'kill "$local_server_pid" 2>/dev/null || true; wait "$local_server_pid" 2>/dev/null || true' EXIT
local_ready=0
for local_poll in {1..30}; do
    kill -0 "$local_server_pid"
    if curl -fsS --max-time 1 http://127.0.0.1:11435/api/version >runtime/local-comparison/server-version.json; then
        local_ready=1
        break
    fi
    sleep 0.25
done
test "$local_ready" = 1
cat >runtime/local-comparison/Modelfile <<'MODELFILE'
FROM /home/datamata/.cache/huggingface/hub/models--Qwen--Qwen2.5-1.5B-Instruct/snapshots/989aa7980e4cf806f80c7fef2b1adb7bc71aa306
TEMPLATE """{{ range .Messages }}<|im_start|>{{ .Role }}
{{ .Content }}<|im_end|>
{{ end }}<|im_start|>assistant
"""
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|endoftext|>"
MODELFILE
timeout 180s ollama create cqa-qwen25-1p5b-local -f runtime/local-comparison/Modelfile
ollama show cqa-qwen25-1p5b-local --modelfile >runtime/local-comparison/imported-modelfile.txt
ollama show cqa-qwen25-1p5b-local --verbose >runtime/local-comparison/imported-model.txt
# Run the bounded client described below inside this same shell/lock.
```

The explicit two-message ChatML template matches the cached tokenizer's system/user/assistant framing without tools. Verify imported architecture, precision, context, template and stops before inference. Do not silently switch quantization. Normal import may convert source BF16 precision to a GGUF representation: record the actual output precision/digest. Official import guidance uses `FROM <Safetensors directory>` followed by `ollama create`. [Import documentation](https://docs.ollama.com/import).

## Frozen five-case comparison

Baseline run: `34f4496c-876a-4e03-9f6e-72c92d89a556`, `claude-sonnet-5-5`, prompt `cqa-assessment-v1`, checklist `cqa-v1`. Read original assessments in that exact run, not mutable final/latest values. All five snapshots share canonical SHA-256 `2dc9102ae195a0d96e754b7c70972c0f380cea18a23844a555867f36eef3d974` (sorted compact UTF-8 JSON, `ensure_ascii=False`).

| DEV conversation | Reason / language and channel | Turns | Prompt UTF-8 bytes | Claude original score | Recorded latency | Recorded USD |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `p1-en-001` | Predeclared N/A demo / EN chat | 12 | 7,784 | 92.31 | 5.017 s | 0.013582 |
| `p1-en-013` | Predeclared critical demo / EN chat | 14 | 8,004 | 26.25 | 10.112 s | 0.014742 |
| `p1-ru-025` | Shortest RU chat by transcript-text character count | 11 | 8,146 | 100.00 | 5.098 s | 0.013118 |
| `p1-kz-014` | Shortest KZ chat by the same rule | 12 | 8,327 | 92.31 | 5.277 s | 0.013608 |
| `p4-ru-002` | Shortest RU voice transcript by the same rule | 73 | 20,242 | 61.00 | 7.327 s | 0.024610 |

Selection ties use conversation ID. This is a deliberately small presentation sample, partly selected from known demo cases; it is not a random or gold-label accuracy benchmark. The voice case assesses its existing transcript, with no audio/ASR work. Five historical attempts all succeeded; their actual summed provider cost is **USD 0.079660**. Reusing them costs zero additional API spend. Their latencies were observed in a prior concurrent bulk run and include provider/network behavior; this is not a controlled same-time speed benchmark.

Future client design:

1. Open `runtime/cqa.sqlite3` with SQLite URI `mode=ro`, `PRAGMA query_only=ON`, and one read transaction. Select source rows from `documents` collection `conversations`, baseline rows from `evaluations` by the exact run, and linked attempt IDs from `usage/ledger`. Freeze source, prompt, schema and checklist hashes in an ignored manifest. Never initialize the application or write back to the DB.
2. Reconstruct the exact user JSON from `evaluations.py:67–71`, preserving `json.dumps(..., ensure_ascii=False)` default spacing, full checklist snapshot, full ordered transcript and original turn fields. Use unchanged `SYSTEM` (`evaluations.py:17–28`) and `Assessment.model_json_schema()` (805 bytes with the inspected serializer). Send the same eight criteria in one assessment, never eight isolated prompts. Do not truncate, summarize, translate, or remove bot/system turns. Do not reveal Claude judgments to Qwen.
3. Submit once per fixed case, serially, using the existing Python interpreter and stdlib HTTP. No retries or repair prompts. Start with `p1-en-001` as the readiness case; keep schema failure as a measured outcome. Use the request below; `SYSTEM`, `prompt` and `schema` are the values from step 2, not literal placeholder text. HTTP deadline 90 seconds per case; at most five primary requests.

```python
body = {
    "model": "cqa-qwen25-1p5b-local",
    "messages": [{"role": "system", "content": SYSTEM},
                 {"role": "user", "content": prompt}],
    "format": schema, "stream": False, "keep_alive": 0,
    "truncate": False, "shift": False,
    "options": {"num_ctx": 16384, "num_predict": 4096,
                "num_batch": 128, "temperature": 0, "seed": 2026,
                "num_thread": 6},
}
request = urllib.request.Request(
    "http://127.0.0.1:11435/api/chat",
    data=json.dumps(body, ensure_ascii=False).encode(),
    headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(request, timeout=90) as response:
    result = json.load(response)
```

`keep_alive=0` makes each primary request a cold load and prevents previous-case prompt-cache reuse; record cold loading separately. Check server/processor metadata for actual GPU/CPU placement rather than assuming full offload. Require `done=true` and successful stop; reject output-limit/context errors as failed attempts. `truncate=false`/`shift=false` are present in the installed release API types and prevent silently substituting partial-context results. Local token counts remain unknown until execution; 16K is an initial bound, not proof the full call fits. If a case does not fit with the output budget, report that failure rather than silently reducing input or changing the fixed run configuration. [Release API request types](https://raw.githubusercontent.com/ollama/ollama/v0.34.0/api/types.go), [chat API](https://docs.ollama.com/api/chat).

4. Parse `message.content` with the same duplicate-key/nonfinite rejection as `provider.py:65–78,175`; validate original Draft 2020-12 schema, then strict `Assessment.model_validate`, then `score_criteria(checklist["criteria"], judgments, turn_count)`. This catches repeated/missing/unknown criteria, incorrect boolean/scale/N/A values and invalid/duplicate evidence indices. Record each validation stage separately. The model never computes official totals (`scoring.py:13–71`). Schema-constrained decoding alone does not establish semantic evidence quality. [Ollama structured output documentation](https://docs.ollama.com/capabilities/structured-outputs).
5. For up to 40 eligible criterion pairs, report exact raw-value agreement (strict type and null), applicability agreement, critical flag agreement, deterministic score deltas and each disagreement. Invalid cases remain failures in the five-case denominator; do not compare partial scores. Report in-range/nonempty evidence separately from a human check that cited turns support each judgment. Evidence-set overlap is descriptive, not correctness. Inspect disputed rationales and cite source turn indices without publishing transcripts. Claude is a comparator, not ground truth.
6. Save per-case monotonic wall time, server total/load/prompt/decode durations, prompt/output token counts, stop reason, actual model digest/precision and failure category. Ollama durations are nanoseconds; convert explicitly. Sample GPU usage and host memory during the run, clearly distinguishing sampled from allocator peaks. Save setup/import elapsed time separately. Local provider fee is zero; electricity, hardware, setup time and total operating cost are unmeasured. Do not equate zero API fee with zero cost. [Official usage metrics](https://docs.ollama.com/api/usage).

## Evidence commands and remaining checks

Executed without model loading: `git rev-parse HEAD`, `git status --short --branch`, targeted `nl -ba`/`rg` source reads; `backend/.venv/bin/python` with `importlib.metadata.version` only for dependency inventory; `command -v uv ollama nvidia-smi flock timeout torchrun transformers-cli llama-cli llama-server`; `free -m`; `ollama create --help`; `ollama serve --help`; `ollama show --help`. The initial sandbox GPU/systemd reads failed; normal read-only escalation succeeded with:

```bash
nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv,noheader
systemctl show ollama.service --property=ActiveState,SubState,FragmentPath --no-pager
ollama --version
```

Python metadata checks enumerated only the named snapshot, parsed its nonsecret JSON/tokenizer files, checked identity existence, listed known Ollama runtime-library paths, and streamed the installed binary to check converter/environment markers. No weights, credentials, identity contents, URLs or transcripts were printed. `go version -m /usr/local/bin/ollama` could not run because the Go shim has no selected version; no Go/config change was attempted.

The comparison table was independently recomputed via stdlib SQLite `mode=ro`/`query_only` in a read transaction. For deterministic selection: filter DEV rows by `(language,channel)`, minimize `(sum(len(turn["text"]) for turn in transcript), conversation_id)`, then prepend the two fixed English demo IDs. Prompt construction and hash algorithms are specified above. Evidence sources: active `backend/src/cqa/{evaluations,provider,scoring,models,config,prepare,storage}.py`, `docs/api-contract.md:130`, active plan Task 7, active `demo-selection.md`, and original-root `readiness.md`/`runtime-feasibility.md`. These sources and the immutable run/checklist identities are sufficient to reproduce the metadata query without raw content in this report.

Fallback if import/runtime fails: report the exact failure category and use retained Claude results for the mandatory demo. A direct Transformers path would need a separately pinned experiment environment with CUDA PyTorch, Transformers and transitive tokenizer/Safetensors dependencies; the current backend is insufficient. It can load this local snapshot without a service, but entails substantial package download/setup and is not the minimum-risk deadline path. Do not mutate the backend lockfile just for the experiment. [Official Transformers installation guidance](https://huggingface.co/docs/transformers/en/installation).

Not checked: weight integrity, import execution, native-format precision, GPU library loading, inference/tokenization, local output/quality, actual peak memory, local latency/energy, full model/server network behavior, independent human regrading, or repeatability across hardware/runtime versions. No installs, downloads, server starts, model conversion/inference, paid calls, DB writes, Git mutations or publication occurred. The next action belongs to the overseer: scope one bounded Task 7 execution with the known identity-file side effect and retain all outcomes, including failure.
