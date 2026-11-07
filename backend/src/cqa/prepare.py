"""Explicit, lock-protected account/smoke/DEV preparation; never runs on import."""

import argparse
import fcntl
import json
import os
import re
from contextlib import contextmanager

from .budget import Budget, now
from .config import Settings
from .evaluations import Evaluator, PROMPT_VERSION
from .jobs import JobManager
from .provider import ModelClient
from .rubric import default_checklist
from .storage import Store


@contextmanager
def model_job_lock(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as file:
        try:
            fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("The project model-job lock is held; wait for the active job") from None
        try:
            yield
        finally:
            fcntl.flock(file, fcntl.LOCK_UN)


def normalize_credential(path):
    """Explicit migration of one unambiguous local key; never return its contents."""
    if path is None:
        raise ValueError("CQA_ENV_FILE is required to normalize a credential")
    contents = path.read_text()
    candidates = set(re.findall(r"(?<![A-Za-z0-9_-])sk-ant-[A-Za-z0-9_-]+", contents))
    if len(candidates) != 1:
        raise ValueError("Credential normalization needs exactly one unambiguous credential")
    # Replace the same ignored file in place. No backups or key-derived artifacts.
    descriptor = os.open(path, os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as file:
        os.fchmod(file.fileno(), 0o600)
        file.write("ANTHROPIC_API_KEY=" + next(iter(candidates)) + "\n")
    return {"credential_normalized": True}


def run_stage(settings: Settings, stage: str, *, repeat: bool = False) -> dict:
    with model_job_lock(settings.model_lock):
        store = Store(settings.database_path)
        store.insert_immutable("checklists", {"cqa-v1": default_checklist()})
        budget = Budget(store)
        client = ModelClient(budget, settings=settings)
        if stage == "account":
            try:
                models = list(client.sdk.models.list(limit=1000))
            except Exception as error:
                raise ValueError(f"Authenticated model list failed ({type(error).__name__}, HTTP {getattr(error, 'status_code', 'unavailable')})") from None
            ids = sorted(model.id for model in models)
            result = {"checked_at": now(), "model": client.model, "available": client.model in ids, "model_ids": ids}
            store.put("preparation", "account", result)
            if not result["available"]:
                raise ValueError("Configured model is absent from the authenticated model list; do not switch models silently")
            return result
        account = store.get("preparation", "account")
        if not account or account.get("model") != client.model or not account.get("available"):
            raise ValueError("Run the authenticated account stage before paid preparation")
        previous = store.get("preparation", stage)
        if previous and not repeat:
            raise ValueError("This preparation stage already has a durable run; inspect it or explicitly pass --repeat")
        rows = sorted((row for row in store.list("conversations") if row["dataset_id"] == "DEV"), key=lambda row: row["conversation_id"])
        if stage == "smoke":
            selected = [next((row for row in rows if row["language"] == language), None) for language in ("RU", "KZ", "EN")]
            if any(row is None for row in selected):
                raise ValueError("DEV needs a source record in each of RU, KZ and EN for smoke")
        else:
            smoke = store.get("preparation", "smoke")
            if not smoke or smoke.get("model") != client.model or smoke.get("prompt_version") != PROMPT_VERSION or smoke.get("status") != "completed":
                raise ValueError("A schema-valid RU/KZ/EN smoke must complete before bulk DEV")
            if len(rows) != 65:
                raise ValueError("Expected exactly 65 immutable DEV source records")
            selected = rows
        manager = JobManager(store, Evaluator(store, client))
        manager.startup()
        try:
            run = manager.start("DEV", [row["conversation_id"] for row in selected], "cqa-v1")
            record = {"run_id": run["id"], "model": client.model, "prompt_version": PROMPT_VERSION, "status": "running", "created_at": now()}
            store.put("preparation", stage, record)
            # Emit only IDs/counts, never transcripts, prompts or credential fragments.
            print(json.dumps({"stage": stage, "run_id": run["id"], "total": run["total"]}), flush=True)
            while manager.get(run["id"])["status"] in {"queued", "running"}:
                try:
                    manager.wait(run["id"], timeout=30)
                except TimeoutError:
                    progress = manager.get(run["id"])
                    print(json.dumps({"completed": progress["completed"], "failed": progress["failed"], "total": progress["total"]}), flush=True)
            manager.wait(run["id"])
            final = manager.get(run["id"])
            record.update(status=final["status"], finished_at=final["finished_at"])
            store.put("preparation", stage, record)
            usage = budget.summary()
            return {**record, "total": final["total"], "completed": final["completed"], "failed": final["failed"],
                    "spent_usd": usage["spent_usd"], "reserved_usd": usage["reserved_usd"],
                    "errors": [item["error"] for item in final["items"] if item["error"]]}
        except KeyboardInterrupt:
            manager.cancel(run["id"])
            raise
        finally:
            manager.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("account", "smoke", "dev", "normalize-credential"))
    parser.add_argument("--repeat", action="store_true", help="Explicitly authorize another run for an already attempted preparation stage")
    args = parser.parse_args()
    settings = Settings()
    try:
        result = normalize_credential(settings.env_file) if args.stage == "normalize-credential" else run_stage(settings, args.stage, repeat=args.repeat)
    except (ValueError, OSError) as error:
        parser.exit(1, str(error) + "\n")
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
