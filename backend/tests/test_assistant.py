"""Native strict actions preserve context and never execute model code."""

from copy import deepcopy
import json

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from pydantic import ValidationError
from anthropic import transform_schema

from cqa.analytics_models import AnalysisSpec, Report
from cqa.assistant import AssistantAction, AnalysisPatch, NativeAssistantAction, decode_native_action, merge_patch
from cqa.config import Settings
from cqa.main import create_app
from cqa.provider import ModelReply, ProviderError
from cqa.reports import Reports


def action(operation='clarify', **kwargs):
    return {'operation': operation, 'explanation': 'Synthetic intent.', 'patch': None, 'definition': None,
            'metric_id': None, 'question': 'Which period and channel should be selected?' if operation == 'clarify' else None, **kwargs}


def update(spec, fields):
    return action('update_analysis', patch={'target_json': json.dumps(AnalysisSpec.model_validate(spec).model_dump()), 'fields': fields})


class AssistantClient:
    model = 'synthetic'
    def __init__(self, *responses):
        self.responses = list(responses)
        self.prompts = []
    def generate(self, system, prompt, schema, purpose):
        assert purpose == 'assistant'
        assert 'no tools' in system and 'not calculate' in system
        Draft202012Validator.check_schema(schema)
        self.prompts.append(json.loads(prompt))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return ModelReply(response, self.model, {}, 1, 'synthetic-action', 0)


def app_client(store, *responses):
    model = AssistantClient(*responses)
    app = create_app(Settings(database_path=store.path), model_client=model)
    return app, TestClient(app), model


def test_initial_report_and_language_only_followup_preserve_period(analytics_data):
    store, add = analytics_data
    add('ru', language='RU'); add('en', language='EN')
    spec = AnalysisSpec(title='October comparison', filters={'dataset_id': 'DEV', 'start_at': '2026-10-01T00:00:00+05:00', 'end_at': '2026-11-01T00:00:00+05:00', 'channel': 'agent chat'}, group_by='month_half').model_dump()
    # Native defaults/nulls outside the explicit language field must not erase context.
    language_target = AnalysisSpec(title='Ignored default title', filters={'language': 'EN'}).model_dump()
    app, client, model = app_client(store, update(spec, ['title', 'filters.dataset_id', 'filters.channel', 'filters.start_at', 'filters.end_at', 'group_by']), update(language_target, ['filters.language']))
    response = client.post('/api/assistant', json={'content': 'Compare October 2026 chat halves.'})
    assert response.status_code == 200, response.text
    first = response.json()
    assert first['status'] == 'ok' and first['output']['counts']['selected'] == 2
    id = first['report_id']
    second = client.post(f'/api/reports/{id}/messages', json={'content': 'Only English.'}).json()
    assert second['status'] == 'ok' and second['spec']['filters']['language'] == 'EN'
    assert second['spec']['filters']['start_at'] == spec['filters']['start_at']
    assert second['spec']['filters']['end_at'] == spec['filters']['end_at']
    assert second['spec']['filters']['channel'] == 'agent chat' and second['spec']['title'] == spec['title']
    assert second['output']['counts']['selected'] == 1 and 'n=1' in second['message']['content']
    assert model.prompts[1]['current_spec'] == first['spec']
    assert model.prompts[0]['available_datasets'][0]['id'] == 'DEV'
    assert model.prompts[0]['prompt_version'] == 'cqa-assistant-v3'
    assert model.prompts[0]['analysis_spec_schema'] == AnalysisSpec.model_json_schema()
    assert 'target_json' not in first['action']['patch'] and first['action']['patch']['target'] == spec
    assert model.prompts[0]['timezone'] == 'Asia/Almaty' and model.prompts[0]['calendar']['jurisdiction'] == 'KZ'
    assert len(client.get(f'/api/reports/{id}').json()['messages']) == 4
    app.state.jobs.close()


def test_initial_clarification_is_persisted_before_translation_and_reopens(analytics_data):
    store, add = analytics_data
    add('one')
    app, client, model = app_client(store, action())
    real = model.generate
    def generate(*args):
        draft = store.list('reports')[0]
        assert draft['status'] == 'draft' and draft['spec'] is draft['output'] is None
        assert [m['role'] for m in draft['messages']] == ['user']
        return real(*args)
    model.generate = generate
    result = client.post('/api/assistant', json={'content': 'Compare these.'}).json()
    assert result['status'] == 'clarification' and result['report_id']
    assert result['spec'] is result['output'] is None and store.list('runs') == []
    reopened = create_app(Settings(database_path=store.path), model_client=AssistantClient())
    with TestClient(reopened) as again:
        report = again.get('/api/reports/' + result['report_id']).json()
        assert report['status'] == 'draft' and report['stale'] is False and len(report['messages']) == 2
        assert again.post('/api/reports/' + result['report_id'] + '/refresh').status_code == 422
        assert again.post('/api/reports/' + result['report_id'] + '/metrics', json=definition()).status_code == 422
    app.state.jobs.close()


def definition():
    return {'id': 'followup_owner', 'title': 'Operator-led next contact', 'description': 'True if the operator commits to initiating next contact; false if the client must initiate.', 'answer_type': 'boolean', 'allowed_values': [False, True], 'allow_na': True, 'na_condition': 'No future-contact owner is stated or ownership is unintelligible.'}


def test_first_provider_failure_returns_stable_draft_and_attempt(analytics_data):
    store, add = analytics_data; add('one')
    app, client, _ = app_client(store, ProviderError('Synthetic provider failure', 'synthetic-paid-attempt'))
    response = client.post('/api/assistant', json={'content': 'Show October 2026.'}).json()
    assert response['status'] == 'error' and response['report_id']
    assert response['message']['usage_attempt_ids'] == ['synthetic-paid-attempt']
    assert Reports(store).get(response['report_id'])['status'] == 'draft'
    app.state.jobs.close()


@pytest.mark.parametrize('response', [action(), ProviderError('Synthetic rejected request')])
def test_ready_data_survives_clarification_or_provider_error(analytics_data, response):
    store, add = analytics_data; add('one')
    report = Reports(store).create(AnalysisSpec(title='Saved'))
    app, client, _ = app_client(store, response)
    result = client.post('/api/assistant', json={'content': 'What about sentiment from audio tone?', 'report_id': report['id']}).json()
    assert result['status'] in {'clarification', 'error'} and result['output'] == report['output'] and result['spec'] == report['spec']
    assert len(Reports(store).get(report['id'])['messages']) == 2 and store.list('runs') == []
    app.state.jobs.close()


@pytest.mark.parametrize('mutation', ['extra', 'nested', 'unknown_metric', 'unknown_dataset', 'mask', 'duplicate', 'no_mask', 'missing_payload', 'extra_payload', 'missing_id', 'missing_target_fields'])
def test_invalid_actions_rejected_before_analytics_or_job_execution(analytics_data, monkeypatch, mutation):
    store, add = analytics_data; add('one')
    report = Reports(store).create(AnalysisSpec(title='Saved'))
    response = update({'title': 'Changed'}, ['title'])
    target = json.loads(response['patch']['target_json'])
    if mutation == 'extra': response['sql'] = 'DROP TABLE documents'
    if mutation == 'nested': target['filters']['url'] = 'https://untrusted.invalid'
    if mutation == 'unknown_metric': target['metric_ids'] = ['invented']
    if mutation == 'unknown_dataset': target['filters']['dataset_id'] = 'sample5calls'; response['patch']['fields'] = ['filters.dataset_id']
    if mutation == 'mask': response['patch']['fields'] = ['__class__.__subclasses__']
    if mutation == 'duplicate': response['patch']['fields'] = ['title', 'title']
    if mutation == 'no_mask': response['patch']['fields'] = []
    if mutation == 'missing_payload': response['patch'] = None
    if mutation == 'extra_payload': response['question'] = 'Synthetic'
    if mutation == 'missing_id': response = action('rerun_metric', metric_id='invented')
    if mutation == 'missing_target_fields': target = {'title': 'Missing dataset/context'}
    if response.get('patch') is not None: response['patch']['target_json'] = json.dumps(target)
    app, client, _ = app_client(store, response)
    import cqa.reports
    monkeypatch.setattr(cqa.reports, 'analyze', lambda *a: pytest.fail('Invalid action reached analytics'))
    result = client.post(f"/api/reports/{report['id']}/messages", json={'content': 'Apply request.'}).json()
    assert result['status'] == 'error' and result['spec'] == report['spec'] and result['output'] == report['output']
    assert store.list('runs') == [] and store.list('custom_assessments') == []
    assert store.list('conversations')[0]['conversation_id'] == 'one'
    app.state.jobs.close()


def test_mask_null_whole_replacements_and_merged_validation():
    current = AnalysisSpec(title='Saved', filters={'start_at': '2026-10-01T00:00:00+05:00', 'end_at': '2026-11-01T00:00:00+05:00', 'hours': {'start': 6, 'end': 18}}, cohorts=[{'key': 'a', 'label': 'A', 'filters': {}}]).model_dump()
    patch = AnalysisPatch(target=AnalysisSpec(title='Ignored', filters={'start_at': None, 'hours': {'start': 20, 'end': 4}}), fields=['filters.start_at', 'filters.hours', 'cohorts'])
    result = merge_patch(current, patch)
    assert result.filters.start_at is None and result.filters.end_at == current['filters']['end_at']
    assert result.filters.hours.start == 20 and result.cohorts is None and result.title == 'Saved'
    # Both independent targets are valid, but the resulting combination is invalid.
    patch = AnalysisPatch(target=AnalysisSpec(title='Ignored', filters={'start_at': '2026-12-01T00:00:00+05:00'}), fields=['filters.start_at'])
    with pytest.raises(ValidationError): merge_patch(current, patch)


def test_request_limits_missing_report_legacy_ready_and_bounded_history(analytics_data):
    store, add = analytics_data; add('one')
    reports = Reports(store); report = reports.create(AnalysisSpec(title='Legacy'))
    legacy = store.get('reports', report['id']); del legacy['status']; store.put('reports', report['id'], legacy)
    assert reports.get(report['id'])['status'] == 'ready' and store.get('reports', report['id']) == legacy
    for _ in range(45): reports.add_message(report['id'], 'user', 'Synthetic')
    assert len(reports.get(report['id'])['messages']) == 40
    app, client, _ = app_client(store)
    assert client.post('/api/assistant', json={'content': 'x', 'report_id': 'missing'}).status_code == 404
    for body in ({'content': ' '}, {'content': 'x' * 8001}, {'content': 'x', 'sql': 'SELECT *'}):
        assert client.post('/api/assistant', json=body).status_code == 422
    app.state.jobs.close()


def test_native_action_schema_is_strict_object_and_provider_defaults_are_masked():
    schema = transform_schema(NativeAssistantAction.model_json_schema())
    assert schema['type'] == 'object' and schema['additionalProperties'] is False
    assert set(schema['required']) == {'operation', 'explanation', 'patch', 'definition', 'metric_id', 'question'}
    for status, spec, output in [('draft', {}, None), ('ready', None, None)]:
        with pytest.raises(ValidationError):
            Report.model_validate({'id': 'x', 'title': 'x', 'status': status, 'spec': spec, 'output': output, 'created_at': 'x', 'updated_at': 'x', 'messages': [], 'custom_metrics': [], 'stale': False})


def test_restart_retains_assistant_unknown_reservation_without_resend(analytics_data):
    from cqa.budget import Budget
    from cqa.evaluations import Evaluator
    from cqa.jobs import JobManager
    store, add = analytics_data; add('one')
    draft = Reports(store).draft()
    budget = Budget(store)
    budget.reserve(model='synthetic', purpose='assistant', amount=2.1, run_id='assistant:' + draft['id'])
    model = AssistantClient(); model.budget = budget
    jobs = JobManager(store, Evaluator(store, model)); jobs.startup()
    assert budget.summary()['reserved_usd'] == 2.1 and budget.summary()['attempts'][0]['status'] == 'unknown'
    assert model.prompts == [] and Reports(store).get(draft['id'])['status'] == 'draft'
    jobs.close()


def test_native_schema_fits_documented_provider_compilation_limits():
    # Anthropic structured-output contract: <=24 optional parameters, <=16 unions.
    # https://platform.claude.com/docs/en/build-with-claude/structured-outputs
    schema = transform_schema(NativeAssistantAction.model_json_schema())
    def counts(node):
        optional = unions = 0
        if isinstance(node, dict):
            optional += len(set(node.get('properties', {})) - set(node.get('required', [])))
            unions += int('anyOf' in node or isinstance(node.get('type'), list))
            for value in node.values():
                more_optional, more_unions = counts(value)
                optional += more_optional; unions += more_unions
        elif isinstance(node, list):
            for value in node:
                more_optional, more_unions = counts(value)
                optional += more_optional; unions += more_unions
        return optional, unions
    optional, unions = counts(schema)
    assert optional <= 24, f'{optional} optional parameters exceed provider limit 24'
    assert unions <= 16, f'{unions} unions exceed provider limit 16'


@pytest.mark.parametrize('target', ['{', '[]', '{"title":"one","title":"two"}', '{"title":NaN}', '{"title":1e999}', {"title":"object is not a JSON string"}])
def test_native_target_json_rejects_malformed_duplicate_nonfinite_or_nonstring(target):
    payload = update({'title': 'Fixture'}, ['title'])
    payload['patch']['target_json'] = target
    with pytest.raises((ValueError, ValidationError)):
        decode_native_action(payload)


def test_native_target_cannot_add_code_fields_or_bypass_complete_canonical_validation():
    payload = update({'title': 'Fixture'}, ['title'])
    target = json.loads(payload['patch']['target_json'])
    target['filters']['sql'] = 'DROP TABLE documents'
    payload['patch']['target_json'] = json.dumps(target)
    with pytest.raises(ValidationError): decode_native_action(payload)
    payload['patch'] = {'target_json': '{"title":"incomplete"}', 'fields': ['title']}
    with pytest.raises(ValidationError): decode_native_action(payload)
    payload = update({'title': 'Fixture'}, ['title'])
    payload['patch']['target'] = json.loads(payload['patch']['target_json'])
    with pytest.raises(ValidationError): decode_native_action(payload)
