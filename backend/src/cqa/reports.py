"""Saved deterministic snapshots with explicit refresh and read-only staleness."""

from uuid import uuid4

from .analytics import CHECKLIST_VERSION, analyze, observe, select_population
from .analytics_models import AnalysisSpec, Report
from .evaluations import latest_evaluations
from .storage import Store


class Reports:
    def __init__(self, store: Store):
        self.store = store

    def create(self, spec: AnalysisSpec) -> dict:
        output = analyze(self.store, spec)
        report = {'id': str(uuid4()), 'title': spec.title, 'spec': spec.model_dump(), 'output': output,
                  'created_at': output['generated_at'], 'updated_at': output['generated_at'],
                  'messages': [], 'custom_metrics': []}
        self.store.insert_immutable('reports', {report['id']: report})
        return {**report, 'stale': self._stale(report)}

    def _stale(self, report: dict) -> bool:
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
        return Report.model_validate({**report, 'stale': self._stale(report)}).model_dump()

    def list(self) -> list[dict]:
        return [Report.model_validate({**report, 'stale': self._stale(report)}).model_dump() for report in self.store.list('reports')]

    def refresh(self, id: str) -> dict:
        report = self.get(id)
        output = analyze(self.store, AnalysisSpec.model_validate(report['spec']))
        def apply(current):
            # Preserve messages/custom metrics and their old coverage; Task 5 owns metric refresh.
            current.update(output=output, updated_at=output['generated_at'])
            return current
        self.store.update('reports', id, apply)
        return self.get(id)
