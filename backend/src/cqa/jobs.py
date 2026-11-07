"""Explicit persistent evaluation runs. Restart/cancel never resends paid work."""

import copy
import threading
from concurrent.futures import ThreadPoolExecutor, wait
from uuid import uuid4

from .budget import now
from .datasets import conversation_key
from .provider import CancelledBeforeSend, provider_context
from .storage import Store

ACTIVE = {"queued", "running"}


def _counts(run):
    run["completed"] = sum(item["status"] == "completed" for item in run["items"])
    run["failed"] = sum(item["status"] == "failed" for item in run["items"])
    return run


class JobManager:
    def __init__(self, store: Store, evaluator):
        self.store, self.evaluator = store, evaluator
        self._pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="cqa-eval")
        self._threads: dict[str, threading.Thread] = {}
        self._guard = threading.Lock()
        self._closed = False
        self._started = False

    def startup(self):
        """Recover once at deliberate process startup, never during app construction."""
        with self._guard:
            if not self._started:
                self._recover()
                self._started = True

    def _recover(self):
        evaluations = self.store.list("evaluations")
        recovered = set()
        for run in self.store.list("runs"):
            if run["status"] not in ACTIVE and not (run["status"] == "cancelled" and run["finished_at"] is None):
                continue
            recovered.add(run["id"])
            def interrupt(current):
                for item in current["items"]:
                    if item["status"] in ACTIVE:
                        saved = [e for e in evaluations if e["run_id"] == current["id"] and e["conversation_id"] == item["conversation_id"]]
                        if saved:
                            saved.sort(key=lambda e: (e["created_at"], e["id"]))
                            result = saved[-1]
                            item.update(status="completed" if result["status"] == "ok" else "failed", evaluation_id=result["id"], error=result["error"])
                        else:
                            item.update(status="interrupted", error="Backend process stopped; no automatic retry")
                if current["status"] != "cancelled":
                    current["status"] = "interrupted"
                current.update(finished_at=now(), error="Backend process stopped; completed work retained; explicitly create a new run to retry")
                return _counts(current)
            self.store.update("runs", run["id"], interrupt)
        budget = getattr(self.evaluator.client, "budget", None)
        if budget:
            for attempt in budget.summary()["attempts"]:
                if attempt["status"] == "reserved" and attempt["run_id"] in recovered:
                    budget.finish(attempt["id"], status="unknown", error="Backend stopped during request; reservation retained")

    def start(self, dataset_id: str, conversation_ids: list[str], checklist_version_id: str, *, background: bool = True) -> dict:
        if self._closed:
            raise ValueError("Job manager is closed")
        self.startup()
        if not conversation_ids or len(set(conversation_ids)) != len(conversation_ids):
            raise ValueError("Select a nonempty list of unique conversation IDs")
        checklist = self.store.get("checklists", checklist_version_id)
        if checklist is None:
            raise KeyError("Checklist version not found")
        if any(self.store.get("conversations", conversation_key(dataset_id, id)) is None for id in conversation_ids):
            raise KeyError("Conversation not found in the selected dataset")
        run = {"id": str(uuid4()), "kind": "evaluation", "dataset_id": dataset_id, "conversation_ids": conversation_ids,
               "checklist_version_id": checklist_version_id, "status": "queued", "total": len(conversation_ids),
               "completed": 0, "failed": 0, "items": [{"conversation_id": id, "status": "queued", "evaluation_id": None, "error": None} for id in conversation_ids],
               "created_at": now(), "started_at": None, "finished_at": None, "error": None,
               "model": {"mode": "external_api", "name": self.evaluator.client.model}, "checklist_snapshot": copy.deepcopy(checklist)}
        self.store.insert_immutable("runs", {run["id"]: run})
        if background:
            thread = threading.Thread(target=self._process, args=(run["id"],), name=f"cqa-run-{run['id']}", daemon=True)
            with self._guard:
                self._threads[run["id"]] = thread
                thread.start()
        return run

    def get(self, id: str) -> dict:
        run = self.store.get("runs", id)
        if run is None:
            raise KeyError("Run not found")
        return run

    def latest_evaluation(self, dataset_id: str, conversation_id: str, checklist_version_id: str) -> dict | None:
        matches = [row for row in self.store.list("evaluations") if row["dataset_id"] == dataset_id
                   and row["conversation_id"] == conversation_id and row["checklist_version_id"] == checklist_version_id]
        return max(matches, key=lambda row: (row["created_at"], row["id"])) if matches else None

    def cancel(self, id: str) -> dict:
        def cancel(run):
            if run["status"] in ACTIVE:
                run.update(status="cancelled", error="Cancelled by request; in-flight paid work is retained")
                for item in run["items"]:
                    if item["status"] == "queued":
                        item.update(status="cancelled", error="Cancelled before processing")
                if not any(item["status"] == "running" for item in run["items"]):
                    run["finished_at"] = now()
            return _counts(run)
        return self.store.update("runs", id, cancel)

    def _process(self, id):
        def start(run):
            if run["status"] == "queued":
                run.update(status="running", started_at=now())
            return run
        run = self.store.update("runs", id, start)
        futures = [self._pool.submit(self._item, id, conversation_id) for conversation_id in run["conversation_ids"]]
        wait(futures)
        def finish(current):
            for item in current["items"]:
                if item["status"] in ACTIVE:
                    item.update(status="failed", error="Worker stopped before durable completion; inspect attempts before explicitly retrying")
            _counts(current)
            if current["status"] != "cancelled":
                current["status"] = "failed" if current["failed"] else "completed"
                current["error"] = "One or more items failed; inspect item errors" if current["failed"] else None
            current["finished_at"] = now()
            return _counts(current)
        self.store.update("runs", id, finish)

    def _item(self, run_id, conversation_id):
        claimed = False
        def claim(run):
            nonlocal claimed
            item = next(item for item in run["items"] if item["conversation_id"] == conversation_id)
            if run["status"] in ACTIVE and item["status"] == "queued":
                item["status"], claimed = "running", True
            return run
        run = self.store.update("runs", run_id, claim)
        if not claimed:
            return
        conversation = self.store.get("conversations", conversation_key(run["dataset_id"], conversation_id))
        try:
            with provider_context(run_id, lambda: self.get(run_id)["status"] == "cancelled"):
                result = self.evaluator.evaluate(conversation, run["checklist_snapshot"], run_id)
            state, evaluation_id, error = "completed" if result["status"] == "ok" else "failed", result["id"], result["error"]
        except CancelledBeforeSend:
            state, evaluation_id, error = "cancelled", None, "Cancelled before provider send"
        except Exception:
            result = self.evaluator.failure(conversation, run["checklist_snapshot"], run_id, "Evaluation worker failed; explicitly retry after review")
            state, evaluation_id, error = "failed", result["id"], result["error"]
        def finish(current):
            item = next(item for item in current["items"] if item["conversation_id"] == conversation_id)
            item.update(status=state, evaluation_id=evaluation_id, error=error)
            return _counts(current)
        self.store.update("runs", run_id, finish)

    def wait(self, id: str, timeout: float | None = 120) -> None:
        with self._guard:
            thread = self._threads.get(id)
        if thread:
            thread.join(timeout)
            if thread.is_alive():
                raise TimeoutError("Evaluation run is still processing")

    def close(self):
        self._closed = True
        with self._guard:
            threads = list(self._threads.values())
        for thread in threads:
            thread.join()
        self._pool.shutdown(wait=True)
