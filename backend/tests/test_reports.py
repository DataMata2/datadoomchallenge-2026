"""Saved values stay immutable until refresh; reads only compute stale flags."""

from copy import deepcopy

from fastapi.testclient import TestClient

from cqa.analytics_models import AnalysisSpec, Report
from cqa.config import Settings
from cqa.main import create_app
from cqa.models import AppealRequest, DecisionRequest
from cqa.reports import Reports
from cqa.workflows import Workflows


def test_review_marks_snapshot_stale_without_rewriting_and_refreshes(analytics_data):
    store, add = analytics_data
    _, evaluation = add('review', values={'consultation': 0})
    reports = Reports(store)
    report = reports.create(AnalysisSpec(title='Synthetic report'))
    Report.model_validate(report)
    assert report['stale'] is False
    before = deepcopy(store.get('reports', report['id']))
    workflows = Workflows(store)
    appeal = workflows.create_appeal(AppealRequest(evaluation_id=evaluation['id'], criterion_id='consultation', comment='Synthetic review.'))
    assert reports.get(report['id'])['stale'] is True
    workflows.decide(appeal['id'], DecisionRequest(action='change', value=20, reason='Synthetic corrected judgment.'))
    read = reports.get(report['id'])
    assert read['output'] == report['output'] and read['stale'] is True
    assert read['output']['observations'][0]['final']['final_score'] == 80
    assert store.get('reports', report['id']) == before
    assert reports.list()[0]['stale'] is True
    refreshed = reports.refresh(report['id'])
    assert refreshed['id'] == report['id'] and refreshed['created_at'] == report['created_at']
    assert refreshed['stale'] is False
    assert refreshed['output']['groups'][0]['metrics']['final_score']['value'] == 100
    assert refreshed['output']['observations'][0]['revision'] != report['output']['observations'][0]['revision']
    assert store.get('evaluations', evaluation['id'])['original'] == evaluation['original']
    assert 'stale' not in store.get('reports', report['id'])


def test_new_latest_error_and_new_population_mark_stale(analytics_data):
    store, add = analytics_data
    _, evaluation = add('old')
    reports = Reports(store)
    report = reports.create(AnalysisSpec(title='Synthetic'))
    error = {**evaluation, 'id': 'new-error', 'created_at': '2026-11-02T00:00:00Z', 'status': 'error', 'final': None, 'original': None, 'error': 'Synthetic error'}
    store.put('evaluations', error['id'], error)
    assert reports.get(report['id'])['stale'] is True
    fresh = reports.refresh(report['id'])
    assert fresh['output']['counts']['failed'] == 1
    assert fresh['output']['groups'][0]['metrics']['final_score']['value'] is None
    assert fresh['stale'] is False
    add('new', status='unevaluated')
    assert reports.get(report['id'])['stale'] is True
    assert reports.refresh(report['id'])['output']['counts']['selected'] == 2


def test_score_filtered_selection_change_is_detected(analytics_data):
    store, add = analytics_data
    add('unselected', status='unevaluated')
    reports = Reports(store)
    report = reports.create(AnalysisSpec(title='Initially empty', filters={'min_score': 0}))
    assert report['output']['conversation_ids'] == []
    # Synthetic evaluation introduced after report creation; the new eligible row flags stale.
    _, evaluation = add('evaluated')
    evaluation.update(conversation_id='unselected', id='newly-evaluated')
    store.put('evaluations', evaluation['id'], evaluation)
    assert reports.get(report['id'])['stale'] is True


def test_report_api_persistence_missing_and_explicit_refresh(analytics_data):
    store, add = analytics_data
    add('one')
    settings = Settings(database_path=store.path)
    client = TestClient(create_app(settings))
    assert client.get('/api/reports').json() == {'items': [], 'total': 0}
    assert client.get('/api/reports/missing').status_code == 404
    assert client.post('/api/reports/missing/refresh').status_code == 404
    response = client.post('/api/reports', json={'title': 'Synthetic report', 'group_by': 'day_night'})
    assert response.status_code == 201, response.text
    report = response.json()
    assert report['messages'] == [] and report['custom_metrics'] == [] and report['stale'] is False
    stored = store.get('reports', report['id'])
    assert 'stale' not in stored
    restarted = TestClient(create_app(settings))
    assert restarted.get('/api/reports').json() == {'items': [report], 'total': 1}
    assert restarted.get('/api/reports/' + report['id']).json() == report
    # Refresh preserves separate future message/metric documents and coverage.
    stored.update(messages=[{'id': 'message', 'role': 'assistant', 'content': 'Synthetic', 'created_at': report['created_at']}], custom_metrics=[{'definition': {'id': 'synthetic', 'title': 'Synthetic', 'description': 'Synthetic observed property.', 'answer_type': 'boolean', 'allowed_values': [False, True], 'allow_na': False, 'na_condition': None}, 'run_ids': []}])
    store.put('reports', report['id'], stored)
    refresh = restarted.post('/api/reports/' + report['id'] + '/refresh').json()
    assert refresh['messages'][0]['content'] == stored['messages'][0]['content']
    assert store.get('reports', report['id'])['custom_metrics'] == stored['custom_metrics']
    assert refresh['custom_metrics'][0]['aggregate']['uncovered_count'] == 1


def test_confirmed_review_changes_revision_even_when_score_is_unchanged(analytics_data):
    store, add = analytics_data
    _, evaluation = add('confirmed')
    workflows, reports = Workflows(store), Reports(store)
    appeal = workflows.create_appeal(AppealRequest(evaluation_id=evaluation['id'], criterion_id='contact', comment='Synthetic confirmation.'))
    report = reports.create(AnalysisSpec(title='Before confirmation'))
    workflows.decide(appeal['id'], DecisionRequest(action='confirm', reason='Synthetic evidence confirmed.'))
    after = reports.get(report['id'])
    assert after['stale'] is True and after['output'] == report['output']
    refreshed = reports.refresh(report['id'])
    assert refreshed['output']['observations'][0]['final'] == report['output']['observations'][0]['final']
    assert refreshed['output']['observations'][0]['revision'] != report['output']['observations'][0]['revision']
    assert refreshed['stale'] is False
