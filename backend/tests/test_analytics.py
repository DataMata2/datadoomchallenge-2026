"""Numerical aggregates use final observations and explicit denominators."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from cqa.analytics import analyze
from cqa.analytics_models import AnalysisOutput, AnalysisSpec
from cqa.config import Settings
from cqa.main import create_app


def analysis(store, **kwargs):
    return analyze(store, AnalysisSpec(title='Synthetic report', **kwargs))


def test_means_zero_na_errors_counts_and_chart_denominators(analytics_data):
    store, add = analytics_data
    zeros = {'contact': False, 'discovery': False, 'identification': False, 'consultation': 0,
             'empathy': False, 'dialogue': 0, 'closure': False, 'critical': True}
    add('zero', values=zeros)
    add('full', values={'discovery': None})
    add('error', status='error')
    add('unevaluated', status='unevaluated')
    before = store.list('evaluations')
    output = analysis(store)
    AnalysisOutput.model_validate(output)
    assert output['counts'] == {'selected': 4, 'evaluated': 2, 'failed': 1, 'unevaluated': 1}
    metrics = output['groups'][0]['metrics']
    assert metrics['final_score'] == {'value': 50, 'sample_count': 2, 'na_count': 0}
    assert metrics['discovery'] == {'value': 0, 'sample_count': 1, 'na_count': 1}
    assert metrics['consultation'] == {'value': 50, 'sample_count': 2, 'na_count': 0}
    assert metrics['critical'] == {'value': 50, 'sample_count': 2, 'na_count': 0}
    assert len(output['observations']) == 4 and len(output['evaluation_ids']) == 3
    for series in output['chart_series']:
        assert series['points'][0]['sample_count'] == metrics[series['metric_id']]['sample_count']
    assert store.list('evaluations') == before
    assert store.list('reports') == []


def test_empty_and_all_na_aggregates_are_null(analytics_data):
    store, add = analytics_data
    output = analysis(store)
    assert output['groups'][0]['counts']['selected'] == 0
    assert all(metric == {'value': None, 'sample_count': 0, 'na_count': 0} for metric in output['groups'][0]['metrics'].values())
    add('na', values={'discovery': None})
    assert analysis(store)['groups'][0]['metrics']['discovery'] == {'value': None, 'sample_count': 0, 'na_count': 1}


def test_latest_error_never_falls_back_to_older_success(analytics_data):
    store, add = analytics_data
    _, earlier = add('attempt')
    later = {**earlier, 'id': 'new-error', 'created_at': '2026-11-02T00:00:00Z', 'status': 'error', 'original': None, 'final': None, 'error': 'Synthetic error'}
    store.put('evaluations', later['id'], later)
    output = analysis(store)
    assert output['evaluation_ids'] == ['new-error']
    assert output['counts']['failed'] == 1 and output['counts']['evaluated'] == 0
    assert output['groups'][0]['metrics']['final_score']['value'] is None
    assert output['observations'][0]['evaluation_status'] == 'error'
    assert analysis(store, filters={'min_score': 0})['conversation_ids'] == []


def test_month_halves_and_local_daypart_boundaries(analytics_data):
    store, add = analytics_data
    for id, stamp in [('a', '2026-10-15T05:59:59+05:00'), ('b', '2026-10-16T06:00:00+05:00'),
                      ('c', '2026-10-31T17:59:59+05:00'), ('d', '2026-11-01T18:00:00+05:00'),
                      ('e', '2026-11-01T12:00:00+05:00')]:
        add(id, stamp)
    groups = {g['key']: g for g in analysis(store, group_by='month_half')['groups']}
    assert groups['2026-10:first_half']['conversation_ids'] == ['a']
    assert groups['2026-10:second_half']['conversation_ids'] == ['b', 'c']
    assert groups['2026-11:first_half']['conversation_ids'] == ['d', 'e']
    dayparts = {g['key']: g for g in analysis(store, group_by='daypart')['groups']}
    assert list(dayparts) == ['night', 'morning', 'afternoon', 'evening']
    assert {k: v['conversation_ids'] for k, v in dayparts.items()} == {'night': ['a'], 'morning': ['b'], 'afternoon': ['c', 'e'], 'evening': ['d']}
    daynight = {g['key']: g for g in analysis(store, group_by='day_night')['groups']}
    assert daynight['day']['conversation_ids'] == ['b', 'c', 'e']
    assert daynight['night']['conversation_ids'] == ['a', 'd']
    for group in groups.values():
        assert group['counts']['selected'] == group['metrics']['final_score']['sample_count']


def test_explicit_first_last_seven_days_intersect_global_language(analytics_data):
    store, add = analytics_data
    for id, day, language in [('early', 1, 'RU'), ('wrong-language', 2, 'EN'), ('middle', 15, 'RU'), ('late', 31, 'RU')]:
        add(id, f'2026-10-{day:02}T12:00:00+05:00', language=language)
    cohorts = [{'key': 'start', 'label': 'First seven days', 'filters': {'start_at': '2026-10-01T00:00:00+05:00', 'end_at': '2026-10-08T00:00:00+05:00'}},
               {'key': 'end', 'label': 'Last seven days', 'filters': {'start_at': '2026-10-25T00:00:00+05:00', 'end_at': '2026-11-01T00:00:00+05:00'}}]
    output = analysis(store, filters={'language': 'RU'}, cohorts=cohorts)
    assert output['conversation_ids'] == ['early', 'late', 'middle']
    assert [g['conversation_ids'] for g in output['groups']] == [['early'], ['late']]
    assert output['groups'][0]['conditions']['end_at'] == cohorts[0]['filters']['end_at']
    assert len(output['observations']) == 3
    # Cohorts cannot broaden the global language population.
    cohorts[0]['filters'] = {'language': 'EN'}
    empty = analysis(store, filters={'language': 'RU'}, cohorts=cohorts)['groups'][0]
    assert empty['counts']['selected'] == 0
    assert empty['metrics']['final_score'] == {'value': None, 'sample_count': 0, 'na_count': 0}


def test_overlapping_cohorts_keep_unique_root_selection(analytics_data):
    store, add = analytics_data
    add('shared')
    output = analysis(store, cohorts=[{'key': 'a', 'label': 'A', 'filters': {}}, {'key': 'b', 'label': 'B', 'filters': {'language': 'RU'}}])
    assert output['conversation_ids'] == ['shared'] and len(output['evaluation_ids']) == 1
    assert [g['counts']['selected'] for g in output['groups']] == [1, 1]


@pytest.mark.parametrize('patch', [
    {'group_by': 'operator'}, {'metric_ids': ['invented']}, {'metric_ids': []}, {'metric_ids': ['critical', 'critical']},
    {'cohorts': []}, {'cohorts': [{'key': 'a', 'label': 'A', 'filters': {}}] * 2},
    {'cohorts': [{'key': 'a', 'label': 'A', 'filters': {}}], 'group_by': 'daypart'},
    {'cohorts': [{'key': 'a', 'label': 'A', 'filters': {'dataset_id': 'OTHER'}}]},
    {'cohorts': [{'key': str(i), 'label': 'A', 'filters': {}} for i in range(5)]}, {'title': '   '},
])
def test_analysis_allowlist_and_cohort_constraints(patch):
    with pytest.raises(ValidationError):
        AnalysisSpec(**{'title': 'Synthetic', **patch})


def test_analytics_api_is_read_only_and_publishes_provenance(analytics_data):
    store, add = analytics_data
    source, _ = add('one')
    app = create_app(Settings(database_path=store.path))
    client = TestClient(app)
    before = store.list('evaluations')
    response = client.post('/api/analytics', json={'title': 'Synthetic', 'group_by': 'holiday'})
    assert response.status_code == 200, response.text
    output = response.json()
    assert output['definitions']['calendar']['observed'] is True
    assert output['definitions']['scheduling']['counts'] == {'assigned_demo': 1, 'source_only': 0}
    assert output['definitions']['metrics']['final_score']['denominator']
    assert output['filter_interpretation'] and output['observations'][0]['final']
    assert store.list('reports') == [] and store.list('evaluations') == before
    assert store.list('conversations') == [source]
    assert client.post('/api/analytics', json={'title': 'Synthetic', 'metric_ids': ['unknown']}).status_code == 422
