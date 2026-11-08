"""Portable single-owner development server. No model work at startup."""
import fcntl
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
CHILDREN = []
OWNER_LOCK = None
STOP_CODE = None


class Shutdown(Exception):
    def __init__(self, code):
        self.code = code


def stop(signum, _frame):
    global STOP_CODE
    STOP_CODE = 128 + signum


def check_stop():
    if STOP_CODE is not None:
        raise Shutdown(STOP_CODE)


def probe(python, source):
    result = subprocess.run([python, "-"], input=source, text=True, timeout=3)
    check_stop()
    return result.returncode == 0


def main():
    global OWNER_LOCK
    database = Path(os.environ.setdefault("CQA_DATABASE_PATH", str(ROOT / "runtime/cqa.sqlite3")))
    model_lock = Path(os.environ.setdefault("CQA_MODEL_LOCK", str(ROOT / "runtime/model-jobs.lock")))
    python = os.environ.get("CQA_PYTHON", str(ROOT / "backend/.venv/bin/python"))
    vite = ROOT / "frontend/node_modules/.bin/vite"
    if not database.is_absolute() or not model_lock.is_absolute():
        raise ValueError("CQA_DATABASE_PATH and CQA_MODEL_LOCK must be absolute paths.")
    secret = os.environ.get("CQA_ENV_FILE")
    if secret and (not Path(secret).is_absolute() or not os.access(secret, os.R_OK)):
        raise ValueError("CQA_ENV_FILE must be an absolute, readable backend secret-file path.")
    if not os.access(python, os.X_OK) or not os.access(vite, os.X_OK):
        raise ValueError("Install dependencies first; see README. Backend Python and frontend Vite are required.")
    database.parent.mkdir(parents=True, exist_ok=True)
    model_lock.parent.mkdir(parents=True, exist_ok=True)
    OWNER_LOCK = open(str(database) + ".server.lock", "a")
    try:
        fcntl.flock(OWNER_LOCK, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise ValueError("A dev server already owns this database. Reuse it or stop its owner.") from None
    if not probe(python, """import socket
for port in (8000, 5173):
    with socket.socket() as connection:
        try: connection.bind(('127.0.0.1', port))
        except OSError: raise SystemExit(f'Port {port} is occupied. Reuse or stop the existing owner.')
"""):
        return 1
    check_stop()
    os.chdir(ROOT)
    backend = subprocess.Popen([python, "-m", "uvicorn", "cqa.main:app", "--app-dir", str(ROOT / "backend/src"), "--host", "127.0.0.1", "--port", "8000"])
    CHILDREN.append(backend)
    check_stop()
    for _ in range(40):
        if backend.poll() is not None:
            raise ValueError("API exited during startup.")
        if probe(python, """import urllib.request
try:
    with urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=1) as response:
        assert response.status == 200
except Exception: raise SystemExit(1)
"""):
            break
        time.sleep(0.25)
    else:
        raise ValueError("API readiness check timed out.")
    check_stop()
    frontend = subprocess.Popen([str(vite), str(ROOT / "frontend"), "--host", "127.0.0.1", "--port", "5173", "--strictPort"])
    CHILDREN.append(frontend)
    check_stop()
    print(f"CQA local workspace: http://127.0.0.1:5173\nAPI: http://127.0.0.1:8000/docs\nOwner PID: {os.getpid()}; backend PID: {backend.pid}; frontend PID: {frontend.pid}\nDatabase: {database}", flush=True)
    while True:
        check_stop()
        for child in CHILDREN:
            code = child.poll()
            if code is not None:
                return code if code >= 0 else 128 - code
        time.sleep(0.05)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    exit_code = 1
    try:
        exit_code = main()
    except Shutdown as error:
        exit_code = error.code
    except (ValueError, OSError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
    finally:
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        for child in CHILDREN:
            if child.poll() is None:
                child.terminate()
        for child in CHILDREN:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        if OWNER_LOCK is not None:
            OWNER_LOCK.close()
    sys.exit(exit_code)
