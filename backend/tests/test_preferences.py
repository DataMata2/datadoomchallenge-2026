"""Offline preferences, immutable language snapshots and historical compatibility."""

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import runpy
from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest

from cqa.analytics_models import AnalysisSpec
from cqa.config import Settings
from cqa.custom_metrics import CustomMetrics
from cqa.datasets import conversation_key
from cqa.evaluations import Evaluator, LEGACY_PROMPT_VERSION, LEGACY_SYSTEM
from cqa.jobs import JobManager
from cqa.main import create_app
from cqa.models import WorkspaceSettings
from cqa.preferences import Preferences
from cqa.provider import ModelReply, ProviderError
from cqa.reports import Reports
from cqa.rubric import default_checklist
from cqa.storage import Store
from test_assistant import action, definition, update
from test_evaluation_jobs import FixtureClient, prepared


class NoProvider:
    model = 'synthetic-offline'

    def generate(self, *args):
        pytest.fail('Preferences must not call a provider')


def test_default_read_and_save_are_durable_and_do_not_touch_other_documents(tmp_path):
    path = tmp_path / 'preferences.db'
    app = create_app(Settings(database_path=path), model_client=NoProvider())
    with TestClient(app) as client:
        store = app.state.store
        store.put('conversations', 'sentinel', {'unchanged': 'source'})
        store.put('evaluations', 'sentinel', {'unchanged': 'evaluation'})
        before = path.read_bytes()
        assert client.get('/api/settings').json() == {'analysis_language': 'RU'}
        assert path.read_bytes() == before
        assert store.list('workspace_settings') == []
        unchanged = {name: store.list(name) for name in ('conversations', 'evaluations', 'checklists', 'usage', 'runs', 'reports', 'custom_assessments')}
        for language in ('EN', 'KZ'):
            response = client.post('/api/settings', json={'analysis_language': language})
            assert response.status_code == 200 and response.json() == {'analysis_language': language}
            reopened = create_app(Settings(database_path=path), model_client=NoProvider())
            try:
                assert reopened.state.preferences.get().model_dump() == {'analysis_language': language}
            finally:
                reopened.state.jobs.close()
        assert {name: store.list(name) for name in unchanged} == unchanged
        assert store.list('workspace_settings') == [{'analysis_language': 'KZ'}]


@pytest.mark.parametrize('body', [
    {'analysis_language': 'ru'}, {'analysis_language': 'FR'}, {'analysis_language': None},
    {'analysis_language': 1}, {'analysis_language': True}, {'analysis_language': ['RU']},
    {'analysis_language': 'RU', 'source_language': 'EN'}, {'language': 'RU'},
])
def test_invalid_settings_reject_without_mutation(tmp_path, body):
    app = create_app(Settings(database_path=tmp_path / 'invalid.db'), model_client=NoProvider())
    with TestClient(app) as client:
        assert client.post('/api/settings', json=body).status_code == 422
        assert client.get('/api/settings').json() == {'analysis_language': 'RU'}
        assert app.state.store.list('workspace_settings') == []


@pytest.mark.parametrize('language', ['RU', 'KZ', 'EN'])
@pytest.mark.parametrize('failure', [None, 'validation', 'worker'])
def test_baseline_queued_run_uses_snapshot_for_prompt_result_and_failures(tmp_path, envelope, language, failure):
    store = prepared(tmp_path, envelope)
    Preferences(store).save(WorkspaceSettings(analysis_language=language))
    client = FixtureClient([] if failure == 'validation' else None)
    calls = []
    generate = client.generate

    def capture(system, prompt, schema, purpose):
        calls.append((system, json.loads(prompt)))
        return generate(system, prompt, schema, purpose)

    client.generate = capture
    evaluator = Evaluator(store, client)
    if failure == 'worker':
        evaluator.evaluate = lambda *a: (_ for _ in ()).throw(RuntimeError('Synthetic worker error'))
    jobs = JobManager(store, evaluator)
    try:
        run = jobs.start('DEV', ['fiction-0'], 'cqa-v1', background=False)
        assert run['analysis_language'] == language
        Preferences(store).save(WorkspaceSettings(analysis_language='EN' if language != 'EN' else 'KZ'))
        jobs.dispatch(run['id']); jobs.wait(run['id'])
        saved = jobs.get(run['id'])
        result = store.get('evaluations', saved['items'][0]['evaluation_id'])
        assert saved['analysis_language'] == result['analysis_language'] == language
        assert result['status'] == ('error' if failure else 'ok')
        assert result['prompt_version'] == 'cqa-assessment-v2'
        if failure != 'worker':
            assert calls[0][1]['analysis_language'] == language
            assert {'RU': 'Russian', 'KZ': 'Kazakh', 'EN': 'English'}[language] + ' assessment explanations' in calls[0][0]
            assert calls[0][1]['conversation']['language'] == 'EN'
            assert calls[0][1]['checklist'] == default_checklist()
    finally:
        jobs.close()


@pytest.mark.parametrize('failure', [None, 'validation', 'worker'])
def test_custom_queued_run_uses_ru_snapshot_and_preserves_baseline(analytics_data, failure):
    store, add = analytics_data; add('one')
    before = {name: store.list(name) for name in ('conversations', 'evaluations', 'checklists', 'usage')}
    calls = []

    def generate(system, prompt, schema, purpose):
        calls.append((system, json.loads(prompt)))
        judgment = {'value': True, 'rationale': 'Синтетическое обоснование.', 'evidence_turns': [3]}
        if failure == 'validation':
            judgment['evidence_turns'] = [4]
        return ModelReply(judgment, 'synthetic', {}, 1, 'synthetic-attempt', 0)

    jobs = JobManager(store, Evaluator(store, SimpleNamespace(model='synthetic', generate=generate)))
    metrics, reports = CustomMetrics(store, jobs), Reports(store)
    if failure == 'worker':
        jobs.handlers['custom_metric'].evaluate = lambda *a: (_ for _ in ()).throw(RuntimeError('Synthetic worker error'))
    try:
        report = reports.create(AnalysisSpec(title='Синтетический отчёт'))
        run = metrics.start(report['id'], definition(), background=False)
        Preferences(store).save(WorkspaceSettings(analysis_language='EN'))
        jobs.dispatch(run['id']); jobs.wait(run['id'])
        saved = jobs.get(run['id'])
        result = store.get('custom_assessments', saved['items'][0]['assessment_id'])
        assert saved['analysis_language'] == result['analysis_language'] == 'RU'
        assert result['status'] == ('error' if failure else 'ok')
        if failure != 'worker':
            assert calls[0][1]['analysis_language'] == 'RU' and 'short Russian rationale' in calls[0][0]
        assert {name: store.list(name) for name in before} == before
        assert result['prompt_version'] == 'cqa-custom-metric-v2'
    finally:
        jobs.close()


@pytest.mark.parametrize('language', ['RU', 'KZ', 'EN'])
@pytest.mark.parametrize('operation', ['clarify', 'update_analysis', 'add_metric', 'rerun_metric', 'error'])
def test_assistant_captures_one_language_for_prompt_messages_and_child_runs(analytics_data, language, operation):
    store, add = analytics_data; add('one', language='EN')
    reports = Reports(store)
    report = reports.create(AnalysisSpec(title='Saved', filters={'language': 'EN'}))
    calls = []
    spec = AnalysisSpec(title='Синтетический анализ', filters={'language': 'EN'}).model_dump()
    response = {
        'clarify': action(question='Какой период выбрать?'),
        'update_analysis': update(spec, ['title']),
        'add_metric': action('add_metric', definition=definition()),
        'rerun_metric': action('rerun_metric', metric_id=definition()['id']),
        'error': action('rerun_metric', metric_id='missing'),
    }[operation]

    def generate(system, prompt, schema, purpose):
        calls.append((system, json.loads(prompt), schema))
        if purpose == 'assistant':
            # A concurrent settings save must not affect this response or its child run.
            Preferences(store).save(WorkspaceSettings(analysis_language='EN' if language != 'EN' else 'KZ'))
            return ModelReply(response, 'synthetic', {}, 1, 'synthetic-action', 0)
        return ModelReply({'value': True, 'rationale': 'Синтетическое обоснование.', 'evidence_turns': [3]}, 'synthetic', {}, 1, 'synthetic-metric', 0)

    app = create_app(Settings(database_path=store.path), model_client=SimpleNamespace(model='synthetic', generate=generate))
    with TestClient(app) as client:
        if operation == 'rerun_metric':
            previous = app.state.metrics.start(report['id'], definition(), background=False)
            app.state.jobs.cancel(previous['id'])
        Preferences(store).save(WorkspaceSettings(analysis_language=language))
        result = client.post(f"/api/reports/{report['id']}/messages", json={'content': 'Синтетический запрос'}).json()
        assert result['status'] == ('clarification' if operation == 'clarify' else 'error' if operation == 'error' else 'ok')
        assert calls[0][1]['analysis_language'] == language
        assert calls[0][1]['current_spec']['filters']['language'] == 'EN'
        assert {'RU': 'Use Russian for explanations', 'KZ': 'Use Kazakh for explanations', 'EN': 'Use English for explanations'}[language] in calls[0][0]
        assert 'analysis_language' not in calls[0][2]['properties']
        assert {m['analysis_language'] for m in reports.get(report['id'])['messages']} == {language}
        if result['metric_run_id']:
            app.state.jobs.wait(result['metric_run_id'])
            run = app.state.jobs.get(result['metric_run_id'])
            assessment = store.get('custom_assessments', run['items'][0]['assessment_id'])
            assert run['analysis_language'] == assessment['analysis_language'] == language
            assert calls[1][1]['analysis_language'] == language
        prefix = {
            'update_analysis': {'RU': 'Анализ обновлён.', 'KZ': 'Талдау жаңартылды.', 'EN': 'Analysis updated.'},
            'add_metric': {'RU': 'Независимая метрика', 'KZ': 'Тәуелсіз метрика', 'EN': 'Independent metric'},
            'rerun_metric': {'RU': 'Независимая метрика', 'KZ': 'Тәуелсіз метрика', 'EN': 'Independent metric'},
            'error': {'RU': 'Не удалось', 'KZ': 'Сұрауды', 'EN': 'The request'},
        }
        if operation in prefix:
            assert result['message']['content'].startswith(prefix[operation][language])


@pytest.mark.parametrize('language', ['RU', 'KZ', 'EN'])
def test_provider_error_message_uses_selected_language_and_preserves_attempt(tmp_path, language):
    def generate(*args):
        raise ProviderError('Synthetic English provider detail', 'synthetic-attempt')
    app = create_app(Settings(database_path=tmp_path / 'error.db'), model_client=SimpleNamespace(model='synthetic', generate=generate))
    with TestClient(app) as client:
        client.post('/api/settings', json={'analysis_language': language})
        result = client.post('/api/assistant', json={'content': 'Synthetic request'}).json()
        assert result['status'] == 'error' and result['message']['analysis_language'] == language
        assert result['message']['usage_attempt_ids'] == ['synthetic-attempt']
        assert result['error'] == result['message']['content']
        assert result['error'].startswith({'RU': 'Не удалось', 'KZ': 'Модель', 'EN': 'The model'}[language])


def test_legacy_records_default_to_en_on_read_without_storage_rewrite(analytics_data):
    store, add = analytics_data; _, evaluation = add('one')
    app = create_app(Settings(database_path=store.path), model_client=NoProvider())
    with TestClient(app) as client:
        run = app.state.jobs.start('DEV', ['one'], 'cqa-v1', background=False)
        metric = app.state.reports.create(AnalysisSpec(title='Legacy'))
        custom = app.state.metrics.start(metric['id'], definition(), background=False)
        assessment = app.state.jobs.handlers['custom_metric'].failure(store.get('conversations', conversation_key('DEV', 'one')), definition(), custom['id'], 'Synthetic error')
        app.state.reports.add_message(metric['id'], 'assistant', 'Historical English')
        for name, row in [('evaluations', evaluation), ('runs', run), ('runs', custom), ('custom_assessments', assessment)]:
            row.pop('analysis_language'); store.put(name, row['id'], row)
        raw_report = store.get('reports', metric['id']); raw_report['messages'][0].pop('analysis_language'); store.put('reports', metric['id'], raw_report)
        before = {name: store.list(name) for name in ('evaluations', 'runs', 'custom_assessments', 'reports')}
        assert client.get('/api/evaluations/' + evaluation['id']).json()['analysis_language'] == 'EN'
        assert client.get('/api/runs/' + run['id']).json()['analysis_language'] == 'EN'
        assert client.get('/api/custom-assessments/' + assessment['id']).json()['analysis_language'] == 'EN'
        saved = client.get('/api/reports/' + metric['id']).json()
        assert saved['messages'][0]['analysis_language'] == saved['custom_metrics'][0]['runs'][0]['analysis_language'] == 'EN'
        assert {name: store.list(name) for name in before} == before


def test_frozen_v1_system_schema_and_prompt_reconstruction_remain_unchanged(tmp_path, envelope):
    harness = runpy.run_path(str(Path(__file__).resolve().parents[2] / 'scripts/local_model_comparison.py'))
    assert harness['PROMPT_VERSION'] == LEGACY_PROMPT_VERSION == 'cqa-assessment-v1'
    assert harness['SYSTEM'] == LEGACY_SYSTEM
    assert harness['digest'](harness['Assessment'].model_json_schema()) == 'f382e12d6fc3a265440acacbb5681a1c1b968b21c1b260922daa66905a760805'
    assert hashlib.sha256(LEGACY_SYSTEM.encode()).hexdigest() == '6742bb1830ab0c50e68e544424f7efc549f9301b50bc9cae8eb6ae615624c2e1'
    store = Store(tmp_path / 'historical.db')
    checklist = json.loads(json.dumps(default_checklist(), sort_keys=True))
    assert harness['digest'](checklist) == harness['CHECKLIST_HASH']
    source_template = json.loads(json.dumps(envelope['data']['records'][0], sort_keys=True))
    expected = []
    for id in harness['CASES']:
        source = dict(deepcopy(source_template), dataset_id='DEV', conversation_id=id)
        evaluation = {'id': id, 'run_id': harness['RUN'], 'conversation_id': id, 'checklist_snapshot': checklist,
                      'prompt_version': 'cqa-assessment-v1', 'model': {'name': 'claude-sonnet-5-5'}, 'usage_attempt_ids': []}
        store.put('conversations', id, source); store.put('evaluations', id, evaluation)
        expected.append(json.dumps({'schema_version': '1.0', 'prompt_version': 'cqa-assessment-v1', 'checklist': checklist,
            'conversation': {'conversation_id': id, 'channel': source['channel'], 'language': source['language'],
                             'transcript': [{'turn_index': i, **turn} for i, turn in enumerate(source['transcript'], 1)]}}, ensure_ascii=False))
    store.put('usage', 'ledger', {'attempts': {}})
    cases, _ = harness['frozen'](store.path)
    assert [case['prompt'] for case in cases] == expected
    assert all('analysis_language' not in json.loads(prompt) for prompt in expected)


def test_legacy_run_without_language_keeps_english_when_workspace_is_ru(tmp_path, envelope):
    store = prepared(tmp_path, envelope)
    calls = []
    model = FixtureClient()
    real = model.generate

    def capture(system, prompt, schema, purpose):
        calls.append((system, json.loads(prompt)))
        return real(system, prompt, schema, purpose)

    model.generate = capture
    jobs = JobManager(store, Evaluator(store, model))
    try:
        run = jobs.start('DEV', ['fiction-0'], 'cqa-v1', background=False)
        run.pop('analysis_language'); store.put('runs', run['id'], run)
        jobs.dispatch(run['id']); jobs.wait(run['id'])
        evaluation = store.list('evaluations')[0]
        assert Preferences(store).get().analysis_language == 'RU'
        assert evaluation['analysis_language'] == calls[0][1]['analysis_language'] == 'EN'
        assert 'Use English assessment explanations' in calls[0][0]
    finally:
        jobs.close()
