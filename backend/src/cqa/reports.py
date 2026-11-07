"""Saved deterministic snapshots, durable drafts and explicit refresh."""

import threading
from contextlib import contextmanager
from uuid import uuid4

from .analytics import CHECKLIST_VERSION, analyze, observe, select_population
from .analytics_models import AnalysisSpec, Report
from .budget import now
from .evaluations import latest_evaluations
from .storage import Store


class Reports:
    def __init__(self, store: Store):
        self.store = store
        self._guard = threading.Lock()
        self._locks = {}

    @contextmanager
    def conversation_lock(self, id):
        with self._guard:
            lock = self._locks.setdefault(id, threading.Lock())
        with lock:
            yield

    def draft(self):
        stamp = now()
        report = {'id': str(uuid4()), 'title': 'New analysis', 'status': 'draft', 'spec': None, 'output': None,
                  'created_at': stamp, 'updated_at': stamp, 'messages': [], 'custom_metrics': []}
        self.store.insert_immutable('reports', {report['id']: report})
        return self.get(report['id'])

    def create(self, spec: AnalysisSpec) -> dict:
        output = analyze(self.store, spec)
        report = {'id': str(uuid4()), 'title': spec.title, 'status': 'ready', 'spec': spec.model_dump(), 'output': output,
                  'created_at': output['generated_at'], 'updated_at': output['generated_at'],
                  'messages': [], 'custom_metrics': []}
        self.store.insert_immutable('reports', {report['id']: report})
        return self.get(report['id'])

    def add_message(self, id, role, content, attempts=None):
        message = {'id': str(uuid4()), 'role': role, 'content': content, 'created_at': now(), 'usage_attempt_ids': attempts or []}
        def append(current):
            current['messages'] = (current['messages'] + [message])[-40:]
            current['updated_at'] = message['created_at']
            return current
        self.store.update('reports', id, append)
        return message

    def _stale(self, report: dict) -> bool:
        if report.get('status', 'ready') == 'draft':
            return False
        spec = AnalysisSpec.model_validate(report['spec'])
        latest = latest_evaluations(self.store, spec.filters.dataset_id, CHECKLIST_VERSION)
        current_ids = [row['conversation_id'] for row in select_population(self.store, spec.filters, latest)]
        if current_ids != report['output']['conversation_ids']:
            return True
        for saved in report['output']['observations']:
            current = observe(saved['conversation_id'], latest.get(saved['conversation_id']))
            if current['evaluation_id'] != saved['evaluation_id'] or current['revision'] != saved['revision']:
                return True
        return False

    def get(self, id: str) -> dict:
        report = self.store.get('reports', id)
        if report is None:
            raise KeyError('Report not found')
        from .custom_metrics import project_metric
        projected = [project_metric(self.store, report, entry) for entry in report['custom_metrics']]
        return Report.model_validate({**report, 'custom_metrics': projected, 'stale': self._stale(report)}).model_dump()

    def list(self) -> list[dict]:
        return [self.get(report['id']) for report in self.store.list('reports')]

    def replace_analysis(self, id, spec, *, expected_spec):
        output = analyze(self.store, spec)
        def apply(current):
            # A concurrent refresh/update must not combine one spec with another output.
            if current['spec'] != expected_spec:
                raise ValueError('Report analysis changed concurrently; reopen and explicitly retry')
            current.update(status='ready', title=spec.title, spec=spec.model_dump(), output=output, updated_at=output['generated_at'])
            return current
        self.store.update('reports', id, apply)
        return self.get(id)

    def refresh(self, id: str) -> dict:
        report = self.get(id)
        if report['status'] == 'draft':
            raise ValueError('Draft reports cannot be refreshed; first save an analysis')
        return self.replace_analysis(id, AnalysisSpec.model_validate(report['spec']), expected_spec=report['spec'])
