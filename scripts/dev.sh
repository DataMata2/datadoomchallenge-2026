#!/usr/bin/env bash
# One local API owner, one Vite process, no imports or evaluations on startup.
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export CQA_DATABASE_PATH="${CQA_DATABASE_PATH:-$repo_dir/runtime/cqa.sqlite3}"
export CQA_MODEL_LOCK="${CQA_MODEL_LOCK:-$repo_dir/runtime/model-jobs.lock}"
cqa_python="${CQA_PYTHON:-$repo_dir/backend/.venv/bin/python}"
if [[ "$CQA_DATABASE_PATH" != /* || "$CQA_MODEL_LOCK" != /* ]]; then
  echo 'CQA_DATABASE_PATH and CQA_MODEL_LOCK must be absolute paths.' >&2; exit 1
fi
if [[ -n "${CQA_ENV_FILE:-}" && ( "$CQA_ENV_FILE" != /* || ! -r "$CQA_ENV_FILE" ) ]]; then
  echo 'CQA_ENV_FILE must be an absolute, readable backend secret-file path.' >&2; exit 1
fi
if [[ ! -x "$cqa_python" || ! -x "$repo_dir/frontend/node_modules/.bin/vite" ]]; then
  echo 'Install dependencies first: uv sync --project backend --locked; npm --prefix frontend ci' >&2; exit 1
fi
mkdir -p -- "$(dirname -- "$CQA_DATABASE_PATH")" "$(dirname -- "$CQA_MODEL_LOCK")"
exec 9>"${CQA_DATABASE_PATH}.server.lock"
if ! flock -n 9; then echo 'A dev server already owns this database. Reuse it or stop its owner.' >&2; exit 1; fi
"$cqa_python" - <<'PY'
import socket
for port in (8000, 5173):
    with socket.socket() as connection:
        try:
            connection.bind(('127.0.0.1', port))
        except OSError:
            raise SystemExit(f'Port {port} is occupied. Reuse or stop the existing owner; no server was started.')
PY
backend_pid=''
frontend_pid=''
cleanup() {
  trap - EXIT INT TERM
  [[ -z "$frontend_pid" ]] || kill "$frontend_pid" 2>/dev/null || true
  [[ -z "$backend_pid" ]] || kill "$backend_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM
cd -- "$repo_dir"
"$cqa_python" -m uvicorn cqa.main:app --app-dir "$repo_dir/backend/src" --host 127.0.0.1 --port 8000 &
backend_pid=$!
for attempt in {1..40}; do
  if "$cqa_python" - <<'PY'
import urllib.request
try:
    with urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=1) as response:
        assert response.status == 200
except Exception:
    raise SystemExit(1)
PY
  then break; fi
  if ! kill -0 "$backend_pid" 2>/dev/null; then echo 'API exited during startup.' >&2; exit 1; fi
  if [[ "$attempt" == 40 ]]; then echo 'API readiness check timed out.' >&2; exit 1; fi
  sleep .25
done
"$repo_dir/frontend/node_modules/.bin/vite" "$repo_dir/frontend" --host 127.0.0.1 --port 5173 --strictPort &
frontend_pid=$!
printf 'CQA local workspace: http://127.0.0.1:5173\nAPI: http://127.0.0.1:8000/docs\nOwner PID: %s; backend PID: %s; frontend PID: %s\nDatabase: %s\n' "$$" "$backend_pid" "$frontend_pid" "$CQA_DATABASE_PATH"
wait -n "$backend_pid" "$frontend_pid"
