"""Metrics remain separate from baseline grades, with visible partial coverage."""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
import threading

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from cqa.analytics_models import AnalysisSpec
from cqa.budget import Budget
from cqa.config import Settings
from cqa.custom_metrics import CustomMetrics, MetricConflict
from cqa.datasets import conversation_key
from cqa.evaluations import Evaluator
from cqa.exports import build_baseline_export
from cqa.jobs import JobManager
from cqa.main import create_app
from cqa.models import CustomMetricDefinition, Run
from cqa.provider import CancelledBeforeSend, ModelReply
from cqa.reports import Reports
from test_assistant import definition, action, AssistantClient


class MetricClient:
    model = 'synthetic'
    def __init__(self, values=None):
        self.values = values or {}
        self.calls = []
    def generate(self, system, prompt, schema, purpose):
        assert purpose == 'custom_metric' and 'untrusted data' in system
        payload = json.loads(prompt)
        assert [t['turn_index'] for t in payload['conversation']['transcript']] == [1, 2, 3]
        id = payload['conversation']['conversation_id']; self.calls.append(id)
        value = self.values.get(id, True)
        if isinstance(value, Exception): raise value
        response = value if isinstance(value, dict) else {'value': value, 'rationale': 'Synthetic descriptive evidence.', 'evidence_turns': [2, 3]}
        return ModelReply(response, self.model, {}, 1, 'synthetic-metric-attempt', 0)


def setup(store, client=None):
    jobs = JobManager(store, Evaluator(store, client or MetricClient()))
    return jobs, CustomMetrics(store, jobs), Reports(store)


@pytest.mark.parametrize('patch', [
    {'allowed_values': [0, 1]}, {'allowed_values': [True, True]}, {'answer_type': 'scale', 'allowed_values': [True, 1]},
    {'answer_type': 'scale', 'allowed_values': [0, -1]}, {'answer_type': 'scale', 'allowed_values': [0, float('inf')]}, {'answer_type': 'scale', 'allowed_values': [10 ** 400]},
    {'answer_type': 'scale', 'allowed_values': [0, 0.0]}, {'na_condition': None}, {'na_condition': ' '},
    {'allow_na': False}, {'allow_na': 1}, {'title': ' '}, {'execute': 'code'}, {'id': '../unsafe'},
])
def test_invalid_definitions(patch):
    with pytest.raises(ValidationError): CustomMetricDefinition.model_validate({**definition(), **patch})


@pytest.mark.parametrize('patch', [
    {'answer_type': 'scale', 'allowed_values': [0, 2.5, 5]}, {'answer_type': 'scale', 'allowed_values': [0]},
    {'allow_na': False, 'na_condition': None},
])
def test_valid_metric_domains(patch):
    CustomMetricDefinition.model_validate({**definition(), **patch})


def test_metrics_preserve_baseline_bytes_and_export_with_false_na_denominators(analytics_data):
    store, add = analytics_data
    for id in ['true', 'false', 'na']: add(id)
    jobs, metrics, reports = setup(store, MetricClient({'true': True, 'false': False, 'na': None}))
    before = json.dumps(store.list('evaluations'), sort_keys=True)
    sources = json.dumps(store.list('conversations'), sort_keys=True)
    baseline = json.dumps(build_baseline_export(store, jobs, 'DEV', 'Synthetic team'), sort_keys=True)
    report = reports.create(AnalysisSpec(title='Synthetic'))
    run = metrics.start(report['id'], definition())
    jobs.wait(run['id'])
    final = jobs.get(run['id']); Run.model_validate(final)
    assert final['status'] == 'completed' and final['completed'] == 3
    assert final['checklist_snapshot'] is final['checklist_version_id'] is None
    assert all(i['evaluation_id'] is None and i['assessment_id'] for i in final['items'])
    metric = reports.get(report['id'])['custom_metrics'][0]
    assert metric['aggregate'] == {'value': 50.0, 'unit': 'percent_true', 'selected_count': 3, 'assessed_count': 3, 'sample_count': 2, 'na_count': 1, 'failed_count': 0, 'pending_count': 0, 'cancelled_count': 0, 'interrupted_count': 0, 'uncovered_count': 0, 'distribution': {'false': 1, 'true': 1}}
    assert metric['results'][0]['source_url'].startswith('/api/conversations/')
    assert all(r['metric_snapshot'] == definition() and r['usage_attempt_ids'] == ['synthetic-metric-attempt'] for r in metric['results'])
    assert json.dumps(store.list('evaluations'), sort_keys=True) == before
    assert json.dumps(store.list('conversations'), sort_keys=True) == sources
    assert json.dumps(build_baseline_export(store, jobs, 'DEV', 'Synthetic team'), sort_keys=True) == baseline
    jobs.close()
    reopened = Reports(store).get(report['id'])
    assert reopened['custom_metrics'] == reports.get(report['id'])['custom_metrics']


@pytest.mark.parametrize('judgment', [
    {'value': 1, 'rationale': 'Synthetic', 'evidence_turns': [1]},
    {'value': True, 'rationale': 'Synthetic', 'evidence_turns': [4]},
    {'value': True, 'rationale': 'Synthetic', 'evidence_turns': [0]},
    {'value': True, 'rationale': 'Synthetic', 'evidence_turns': [1, 1]},
    {'value': True, 'rationale': ' ', 'evidence_turns': [1]},
    {'value': True, 'rationale': 'Synthetic', 'evidence_turns': [True]},
    {'value': True, 'rationale': 'Synthetic', 'evidence_turns': [1], 'tool': 'exec'},
])
def test_invalid_assessments_are_durable_failures(analytics_data, judgment):
    store, add = analytics_data; add('bad')
    jobs, metrics, reports = setup(store, MetricClient({'bad': judgment}))
    report = reports.create(AnalysisSpec(title='Synthetic'))
    run = metrics.start(report['id'], definition()); jobs.wait(run['id'])
    metric = reports.get(report['id'])['custom_metrics'][0]
    assert metric['status'] == 'failed' and metric['aggregate']['failed_count'] == 1
    assert metric['aggregate']['value'] is None and metric['aggregate']['sample_count'] == 0
    assert metric['results'][0]['status'] == 'error' and metric['results'][0]['usage_attempt_ids'] == ['synthetic-metric-attempt']
    jobs.close()


def test_numeric_aggregate_uses_raw_scale_and_zero_is_applicable(analytics_data):
    store, add = analytics_data; add('zero'); add('two')
    jobs, metrics, reports = setup(store, MetricClient({'zero': 0, 'two': 2}))
    report = reports.create(AnalysisSpec(title='Scale'))
    run = metrics.start(report['id'], {**definition(), 'answer_type': 'scale', 'allowed_values': [0, 2, 5]}); jobs.wait(run['id'])
    aggregate = reports.get(report['id'])['custom_metrics'][0]['aggregate']
    assert aggregate['value'] == 1 and aggregate['unit'] == 'raw_scale' and aggregate['sample_count'] == 2
    assert aggregate['distribution'] == {'0': 1, '2': 1, '5': 0}
    jobs.close()


def test_saved_selection_projection_groups_dataset_and_explicit_rerun_history(analytics_data):
    store, add = analytics_data
    add('ru', language='RU'); add('en', language='EN')
    jobs, metrics, reports = setup(store)
    report = reports.create(AnalysisSpec(title='All', group_by='language'))
    run = metrics.start(report['id'], definition()); jobs.wait(run['id'])
    add('uncovered', language='RU')
    changed = reports.replace_analysis(report['id'], AnalysisSpec(title='RU', filters={'language': 'RU'}, cohorts=[{'key': 'a', 'label': 'A', 'filters': {}}, {'key': 'b', 'label': 'B', 'filters': {}}]), expected_spec=report['spec'])
    metric = changed['custom_metrics'][0]
    assert len(store.list('runs')) == 1 and metric['aggregate']['sample_count'] == 1 and metric['aggregate']['uncovered_count'] == 1
    assert metric['out_of_scope_count'] == 1
    assert [g['aggregate']['sample_count'] for g in metric['groups']] == [1, 1]
    assert run['selection_spec'] == report['spec']
    rerun = metrics.start(report['id'], metric_id=definition()['id']); jobs.wait(rerun['id'])
    metric = reports.get(report['id'])['custom_metrics'][0]
    assert metric['run_ids'] == [run['id'], rerun['id']] and metric['aggregate']['sample_count'] == 2
    # Identical source IDs in another dataset cannot reuse assessments.
    old = reports.get(report['id'])
    copied = deepcopy(store.get('conversations', conversation_key('DEV', 'ru')))
    copied['dataset_id'] = 'OTHER'
    store.insert_immutable('conversations', {conversation_key('OTHER', 'ru'): copied})
    other = reports.replace_analysis(report['id'], AnalysisSpec(title='Other', filters={'dataset_id': 'OTHER'}), expected_spec=old['spec'])
    assert other['custom_metrics'][0]['aggregate']['sample_count'] == 0 and other['custom_metrics'][0]['out_of_scope_count'] == 3
    assert other['custom_metrics'][0]['aggregate']['uncovered_count'] == 1
    assert len(store.list('runs')) == 2 and len(store.list('custom_assessments')) == 4
    jobs.close()


def test_registration_atomic_duplicate_guards_and_dispatch_failure(analytics_data, monkeypatch):
    store, add = analytics_data; add('one')
    jobs, metrics, reports = setup(store); report = reports.create(AnalysisSpec(title='Synthetic'))
    # A late transaction failure rolls back both report entry and queued run.
    from cqa.storage import DocumentTransaction
    original = DocumentTransaction.put
    monkeypatch.setattr(DocumentTransaction, 'put', lambda *a: (_ for _ in ()).throw(RuntimeError('Synthetic write failure')))
    with pytest.raises(RuntimeError): metrics.start(report['id'], definition())
    assert store.list('runs') == [] and reports.get(report['id'])['custom_metrics'] == []
    monkeypatch.setattr(DocumentTransaction, 'put', original)
    run = metrics.start(report['id'], definition(), background=False)
    with pytest.raises(MetricConflict): metrics.start(report['id'], definition())
    with pytest.raises(MetricConflict): metrics.start(report['id'], metric_id=definition()['id'])
    with pytest.raises(KeyError): metrics.start(report['id'], metric_id='invented')
    with pytest.raises(ValueError): metrics.start(report['id'], {**definition(), 'id': 'final_score'})
    assert store.list('custom_assessments') == []
    jobs.cancel(run['id'])
    monkeypatch.setattr(jobs, 'dispatch', lambda id: (_ for _ in ()).throw(RuntimeError('Synthetic launch failure')))
    with pytest.raises(RuntimeError): metrics.start(report['id'], metric_id=definition()['id'])
    metric = reports.get(report['id'])['custom_metrics'][0]
    assert metric['status'] == 'failed' and len(metric['run_ids']) == 2 and metric['aggregate']['failed_count'] == 1
    jobs.close()


def test_parallel_duplicate_launch_is_rejected(analytics_data):
    store, add = analytics_data; add('one')
    jobs, metrics, reports = setup(store); report = reports.create(AnalysisSpec(title='Synthetic'))
    def start(_):
        try: return metrics.start(report['id'], definition(), background=False)['id']
        except MetricConflict: return None
    with ThreadPoolExecutor(max_workers=2) as pool: results = list(pool.map(start, [1, 2]))
    assert sum(id is not None for id in results) == 1 and len(store.list('runs')) == 1
    jobs.close()


def test_partial_failure_pending_cancellation_and_no_resend(analytics_data):
    store, add = analytics_data
    for id in ['done', 'failed', 'pending']: add(id)
    entered, release = threading.Event(), threading.Event()
    client = MetricClient({'failed': RuntimeError('Synthetic provider failure')})
    original = client.generate
    def generate(*args):
        id = json.loads(args[1])['conversation']['conversation_id']
        if id == 'pending':
            entered.set(); assert release.wait(5)
        return original(*args)
    client.generate = generate
    jobs, metrics, reports = setup(store, client); report = reports.create(AnalysisSpec(title='Synthetic'))
    finished = {'done': threading.Event(), 'failed': threading.Event()}
    real_item = jobs._item
    def item(run_id, conversation_id):
        real_item(run_id, conversation_id)
        if conversation_id in finished:
            finished[conversation_id].set()
    jobs._item = item
    run = metrics.start(report['id'], definition())
    assert entered.wait(5) and all(event.wait(5) for event in finished.values())
    try:
        metric = reports.get(report['id'])['custom_metrics'][0]
        assert metric['aggregate']['sample_count'] == 1 and metric['aggregate']['failed_count'] == 1 and metric['aggregate']['pending_count'] == 1
        jobs.cancel(run['id'])
    finally: release.set()
    jobs.wait(run['id'])
    assert jobs.get(run['id'])['status'] == 'cancelled'
    assert reports.get(report['id'])['custom_metrics'][0]['aggregate']['sample_count'] == 2
    assert len(store.list('evaluations')) == 3
    jobs.close()
    new_jobs, _, _ = setup(store, MetricClient()); new_jobs.startup()
    assert len(store.list('custom_assessments')) == 3 and new_jobs.handlers['custom_metric'].client.calls == []
    new_jobs.close()


def test_restart_recovers_custom_result_gap_and_retains_unknown_budget(analytics_data):
    store, add = analytics_data; add('saved'); add('unsent')
    jobs, metrics, reports = setup(store); report = reports.create(AnalysisSpec(title='Synthetic'))
    run = metrics.start(report['id'], definition(), background=False)
    result = jobs.handlers['custom_metric'].evaluate(store.get('conversations', conversation_key('DEV', 'saved')), definition(), run['id'])
    budget = Budget(store)
    attempt = budget.reserve(model='synthetic', purpose='custom_metric', amount=2.1, run_id=run['id'])
    jobs.close()
    client = MetricClient(); client.budget = budget
    resumed, _, reopened = setup(store, client); resumed.startup()
    final = resumed.get(run['id'])
    assert final['status'] == 'interrupted' and final['completed'] == 1
    assert final['items'][0]['assessment_id'] == result['id'] and final['items'][1]['status'] == 'interrupted'
    assert budget.summary()['attempts'][0]['status'] == 'unknown' and budget.summary()['reserved_usd'] == 2.1
    assert reopened.get(report['id'])['custom_metrics'][0]['aggregate']['interrupted_count'] == 1 and client.calls == []
    resumed.close()


def test_custom_setup_never_recovers_a_live_baseline_run(analytics_data):
    store, add = analytics_data; add('one')
    jobs, metrics, reports = setup(store); jobs.startup()
    baseline = jobs.start('DEV', ['one'], 'cqa-v1', background=False)
    report = reports.create(AnalysisSpec(title='Synthetic'))
    custom = metrics.start(report['id'], definition(), background=False)
    assert jobs.get(baseline['id'])['status'] == 'queued' and jobs.get(custom['id'])['status'] == 'queued'
    jobs.close()


def test_metric_api_add_rerun_assessment_and_draft_empty_rejections(analytics_data):
    store, add = analytics_data; add('one')
    app = create_app(Settings(database_path=store.path), model_client=MetricClient())
    with TestClient(app) as client:
        report = client.post('/api/reports', json={'title': 'Synthetic'}).json(); id = report['id']
        response = client.post(f'/api/reports/{id}/metrics', json=definition())
        assert response.status_code == 202, response.text
        app.state.jobs.wait(response.json()['id'])
        result = client.get(f'/api/reports/{id}').json()['custom_metrics'][0]
        aid = result['results'][0]['id']
        assert client.get('/api/custom-assessments/' + aid).json()['metric_id'] == definition()['id']
        assert client.get('/api/evaluations/' + aid).status_code == 404
        rerun = client.post(f"/api/reports/{id}/metrics/{definition()['id']}/runs")
        assert rerun.status_code == 202; app.state.jobs.wait(rerun.json()['id'])
        assert client.post(f'/api/reports/{id}/metrics', json=definition()).status_code == 409
        assert client.post(f'/api/reports/{id}/metrics/invented/runs').status_code == 404
        assert client.post('/api/reports/missing/metrics', json=definition()).status_code == 404
        empty = client.post('/api/reports', json={'title': 'Empty', 'filters': {'dataset_id': 'OTHER'}}).json()
        assert client.post(f"/api/reports/{empty['id']}/metrics", json=definition()).status_code == 422
        assert client.get('/api/custom-assessments/missing').status_code == 404


def test_assistant_can_add_and_explicitly_rerun_immutable_metric(analytics_data):
    store, add = analytics_data; add('one')
    class Combined(MetricClient):
        def __init__(self): super().__init__(); self.actions = [action('add_metric', definition=definition()), action('rerun_metric', metric_id=definition()['id'])]
        def generate(self, system, prompt, schema, purpose):
            if purpose == 'assistant': return ModelReply(self.actions.pop(0), self.model, {}, 1, 'synthetic-action', 0)
            return super().generate(system, prompt, schema, purpose)
    app = create_app(Settings(database_path=store.path), model_client=Combined())
    with TestClient(app) as client:
        report = client.post('/api/reports', json={'title': 'Synthetic'}).json()
        for prompt in ['Add operator-led next contact.', 'Rerun that metric.']:
            response = client.post(f"/api/reports/{report['id']}/messages", json={'content': prompt}).json()
            assert response['status'] == 'ok' and response['metric_run_id']
            app.state.jobs.wait(response['metric_run_id'])
        metric = client.get(f"/api/reports/{report['id']}").json()['custom_metrics'][0]
        assert len(metric['run_ids']) == 2 and metric['definition'] == definition()


def test_cancel_queued_run_exposes_every_cancelled_item_without_provider_calls(analytics_data):
    store, add = analytics_data; add('one'); add('two')
    model = MetricClient()
    jobs, metrics, reports = setup(store, model)
    report = reports.create(AnalysisSpec(title='Queued'))
    run = metrics.start(report['id'], definition(), background=False)
    jobs.cancel(run['id'])
    metric = reports.get(report['id'])['custom_metrics'][0]
    assert metric['status'] == 'cancelled' and metric['aggregate']['cancelled_count'] == 2
    assert metric['aggregate']['sample_count'] == metric['aggregate']['pending_count'] == 0 and model.calls == []
    jobs.close()


def test_na_is_rejected_when_definition_disables_it(analytics_data):
    store, add = analytics_data; add('one')
    jobs, metrics, reports = setup(store, MetricClient({'one': None}))
    report = reports.create(AnalysisSpec(title='Not NA'))
    run = metrics.start(report['id'], {**definition(), 'allow_na': False, 'na_condition': None})
    jobs.wait(run['id'])
    aggregate = reports.get(report['id'])['custom_metrics'][0]['aggregate']
    assert aggregate['failed_count'] == 1 and aggregate['na_count'] == 0
    jobs.close()


def test_analysis_updates_preserve_concurrent_metric_registration_and_messages(analytics_data, monkeypatch):
    store, add = analytics_data; add('one')
    jobs, metrics, reports = setup(store)
    report = reports.create(AnalysisSpec(title='Before'))
    import cqa.reports
    real = cqa.reports.analyze
    def analyze(*args):
        output = real(*args)
        metrics.start(report['id'], definition(), background=False)
        reports.add_message(report['id'], 'user', 'Concurrent message')
        return output
    monkeypatch.setattr(cqa.reports, 'analyze', analyze)
    changed = reports.replace_analysis(report['id'], AnalysisSpec(title='After'), expected_spec=report['spec'])
    assert changed['title'] == 'After' and len(changed['custom_metrics']) == 1 and changed['messages'][0]['content'] == 'Concurrent message'
    jobs.close()
