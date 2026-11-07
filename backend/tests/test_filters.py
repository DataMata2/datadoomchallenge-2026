"""Deterministic local-calendar and strict filtering acceptance cases."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from cqa.analytics import holiday_calendar, select_conversations
from cqa.analytics_models import FilterSpec
from cqa.config import Settings
from cqa.main import create_app


def selected(store, **filters):
    return [row['conversation_id'] for row in select_conversations(store, FilterSpec(**filters))]


def test_exact_october_calendar_and_weekday_intersection(analytics_data):
    store, add = analytics_data
    for day in (18, 19, 23, 24, 25, 26, 27):
        add(str(day), f'2026-10-{day}T12:00:00+05:00')
    assert {day for day in holiday_calendar(2026) if day.month == 10} == {date(2026, 10, 25), date(2026, 10, 26)}
    assert selected(store, holiday=True) == ['25', '26']
    assert selected(store, holiday=True, weekdays=[1]) == ['26']
    assert selected(store, holiday=True, weekdays=[7]) == ['25']
    assert selected(store, holiday=False, weekdays=[7]) == ['18']
    assert selected(store, holiday=False) == ['18', '19', '23', '24', '27']


def test_almaty_boundary_conversion_and_exclusive_end(analytics_data):
    store, add = analytics_data
    for id, stamp in [('a', '2026-10-24T18:59:59Z'), ('b', '2026-10-24T19:00:00Z'),
                      ('c', '2026-10-26T18:59:59Z'), ('d', '2026-10-26T19:00:00Z')]:
        add(id, stamp)
    assert selected(store, holiday=True) == ['b', 'c']
    assert selected(store, start_at='2026-10-25T00:00:00+05:00', end_at='2026-10-27T00:00:00+05:00') == ['b', 'c']
    assert selected(store, hours={'start': 0, 'end': 1}) == ['b', 'd']


def test_overnight_equal_hours_and_unassigned_dates(analytics_data):
    store, add = analytics_data
    for hour in (0, 5, 6, 12, 21, 22, 23):
        add(f'h{hour:02}', f'2026-10-01T{hour:02}:00:00+05:00')
    add('unassigned', None)
    assert selected(store, hours={'start': 22, 'end': 6}) == ['h00', 'h05', 'h22', 'h23']
    assert len(selected(store, hours={'start': 6, 'end': 6})) == 7
    assert len(selected(store)) == 8
    assert 'unassigned' not in selected(store, holiday=False)
    # Actual source call dates are 2025; only demo dates participate.
    add('voice', '2026-10-25T10:00:00+05:00', channel='voice call')
    assert selected(store, channel='voice call', holiday=True) == ['voice']


def test_zero_scores_critical_and_missing_evaluations(analytics_data):
    store, add = analytics_data
    zeros = {'contact': False, 'discovery': False, 'identification': False, 'consultation': 0,
             'empathy': False, 'dialogue': 0, 'closure': False, 'critical': True}
    add('zero', values=zeros)
    add('full')
    add('error', status='error')
    add('missing', status='unevaluated')
    assert selected(store, min_score=0, max_score=0) == ['zero']
    assert selected(store, min_score=0) == ['full', 'zero']
    assert selected(store, critical=True) == ['zero']
    assert selected(store, critical=False) == ['full']


@pytest.mark.parametrize('filters', [
    {'hours': {'start': -1, 'end': 6}}, {'hours': {'start': 6, 'end': 24}}, {'weekdays': [0]},
    {'weekdays': [True]}, {'weekdays': []}, {'weekdays': [1, 1]}, {'min_score': -1}, {'max_score': 101},
    {'min_score': True}, {'critical': 0}, {'min_score': 90, 'max_score': 20},
    {'start_at': '2026-10-01'}, {'start_at': '2026-10-01T10:00:00'}, {'start_at': 'not-a-date'},
    {'start_at': '2026-10-02T00:00:00Z', 'end_at': '2026-10-01T00:00:00Z'}, {'sql': 'SELECT 1'},
])
def test_strict_filters_reject_invalid_predicates(filters):
    with pytest.raises(ValidationError):
        FilterSpec(**filters)


def test_meta_source_only_and_mixed_provenance_and_search_api(analytics_data):
    store, add = analytics_data
    client = TestClient(create_app(Settings(database_path=store.path)))
    assert client.get('/api/meta').json()['scheduling']['mode'] == 'empty'
    source, _ = add('source', None)
    meta = client.get('/api/meta').json()
    assert meta['scheduling']['mode'] == 'source_only'
    assert meta['scheduling']['seed'] is None and meta['available_periods'] == []
    assigned, _ = add('demo')
    meta = client.get('/api/meta').json()
    assert meta['scheduling']['mode'] == 'mixed'
    assert meta['scheduling']['counts'] == {'assigned_demo': 1, 'source_only': 1}
    assert meta['datasets'] == [{'id': 'DEV', 'total_records': 2}]
    assert meta['available_periods'] == ['2026-10']
    assert meta['holiday_calendar']['version'] == '0.108'
    response = client.post('/api/conversations/search', json={'holiday': False})
    assert response.status_code == 200
    assert response.json()['total'] == 1 and response.json()['items'][0]['conversation_id'] == 'demo'
    assert client.post('/api/conversations/search', json={'hours': {'start': -1, 'end': 6}}).status_code == 422
    assert source['transcript'] == assigned['transcript']


def test_standard_json_schema_numeric_bounds(tmp_path):
    schema = create_app(Settings(database_path=tmp_path / 'schema.db')).openapi()['components']['schemas']
    tests = [('CriterionDefinition', 'weight', [-1], [0, 10.5]),
             ('ExportScore', 'final_score', [-1, 101], [0, 100]),
             ('FilterSpec', 'min_score', [-1, 101], [0, 100, None]),
             ('Hours', 'start', [-1, 24], [0, 23])]
    for model, property, invalid, valid in tests:
        prop_schema = schema[model]['properties'][property]
        validator = Draft202012Validator(prop_schema)
        for value in invalid:
            assert not validator.is_valid(value), (model, value, prop_schema)
        for value in valid:
            assert validator.is_valid(value), (model, value, prop_schema)
        assert "'ge':" not in str(prop_schema) and "'le':" not in str(prop_schema)
