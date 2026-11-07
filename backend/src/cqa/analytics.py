"""Deterministic filtering and report arithmetic; no model or persistence writes."""

import hashlib
import json
from copy import deepcopy
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
from zoneinfo import ZoneInfo

import holidays

from .analytics_models import AnalysisOutput, AnalysisSpec, BASELINE_METRICS, FilterConditions, FilterSpec, GROUP_OPTIONS
from .budget import now
from .datasets import DEMO_TIMEZONE
from .evaluations import latest_evaluations
from .rubric import default_checklist
from .storage import Store

ZONE = ZoneInfo(DEMO_TIMEZONE)
CHECKLIST_VERSION = 'cqa-v1'
CALENDAR = {
    'jurisdiction': 'KZ', 'timezone': DEMO_TIMEZONE, 'observed': True,
    'provider': 'holidays', 'version': holidays.__version__, 'language': 'en_US',
    'definition': 'Kazakhstan public holidays including observed days; ordinary weekends are controlled by ISO weekday filters.',
    'sources': ['https://www.gov.kz/article/33969?lang=ru', 'https://www.gov.kz/article/16887?lang=en',
                'https://holidays.readthedocs.io/en/main/auto_gen_docs/kazakhstan/'],
    'verified_period': '2026-10',
}
CALENDAR_RULE = 'Calendar predicates use demo_started_at converted to Asia/Almaty; records without assigned demo dates are excluded only when a calendar predicate is supplied.'


@lru_cache(maxsize=32)
def holiday_calendar(year: int):
    return holidays.country_holidays('KZ', years=[year], observed=True, language='en_US')


def local_start(row: dict) -> datetime | None:
    value = row.get('demo_started_at')
    return datetime.fromisoformat(value).astimezone(ZONE) if value else None


def scheduling_summary(rows: list[dict]) -> dict:
    counts = {mode: sum(row['scheduling']['mode'] == mode for row in rows) for mode in ('assigned_demo', 'source_only')}
    modes = [mode for mode, count in counts.items() if count]
    assigned = [row for row in rows if row['scheduling']['mode'] == 'assigned_demo']
    periods = sorted({start.strftime('%Y-%m') for row in assigned if (start := local_start(row))})
    seeds = sorted({row['scheduling']['seed'] for row in assigned if row['scheduling']['seed'] is not None})
    algorithms = sorted({row['scheduling']['algorithm'] for row in assigned if row['scheduling']['algorithm']})
    return {'mode': modes[0] if len(modes) == 1 else ('mixed' if modes else 'empty'), 'counts': counts,
            'period': periods[0] if len(periods) == 1 else None, 'periods': periods,
            'seed': seeds[0] if len(seeds) == 1 else None, 'seeds': seeds, 'algorithms': algorithms,
            'independent_of_scores': all(row['scheduling']['independent_of_scores'] for row in rows),
            'interpretation': CALENDAR_RULE}


def filtering_options() -> dict:
    return {'fields': list(FilterSpec.model_fields), 'group_by': GROUP_OPTIONS, 'metric_ids': BASELINE_METRICS,
            'comparison_cohorts': {'minimum': 1, 'maximum': 4, 'group_by': 'none', 'combination': 'AND with global filters; cohorts may overlap'},
            'intervals': 'start inclusive, end exclusive; min/max score inclusive',
            'hours': '0–23 local hours; end exclusive; overnight supported; equal endpoints mean full day',
            'weekdays': 'ISO Monday=1 through Sunday=7; holidays and ordinary weekends are separate',
            'month_half': 'days 1–15 and 16–month end, separately for each month',
            'daypart': 'night 00–06; morning 06–12; afternoon 12–18; evening 18–24',
            'day_night': 'day 06–18; night 18–06', 'calendar': CALENDAR_RULE}


def matches(row: dict, conditions: FilterConditions, evaluation: dict | None) -> bool:
    if conditions.channel is not None and row['channel'] != conditions.channel:
        return False
    if conditions.language is not None and row['language'] != conditions.language:
        return False
    needs_date = any(getattr(conditions, key) is not None for key in ('start_at', 'end_at', 'hours', 'weekdays', 'holiday'))
    if needs_date:
        stamp = local_start(row)
        if stamp is None:
            return False
        if conditions.start_at and stamp < datetime.fromisoformat(conditions.start_at):
            return False
        if conditions.end_at and stamp >= datetime.fromisoformat(conditions.end_at):
            return False
        if conditions.hours:
            start, end = conditions.hours.start, conditions.hours.end
            if start < end and not start <= stamp.hour < end:
                return False
            if start > end and not (stamp.hour >= start or stamp.hour < end):
                return False
        if conditions.weekdays is not None and stamp.isoweekday() not in conditions.weekdays:
            return False
        if conditions.holiday is not None and (stamp.date() in holiday_calendar(stamp.year)) != conditions.holiday:
            return False
    if any(getattr(conditions, key) is not None for key in ('min_score', 'max_score', 'critical')):
        final = evaluation.get('final') if evaluation and evaluation['status'] == 'ok' else None
        if final is None:
            return False
        total = final['final_score']
        if conditions.min_score is not None and (total is None or total < conditions.min_score):
            return False
        if conditions.max_score is not None and (total is None or total > conditions.max_score):
            return False
        if conditions.critical is not None and final['critical_flag'] != conditions.critical:
            return False
    return True


def select_population(store: Store, filters: FilterSpec, latest: dict[str, dict]) -> list[dict]:
    return sorted((row for row in store.list('conversations') if row['dataset_id'] == filters.dataset_id
                   and matches(row, filters, latest.get(row['conversation_id']))), key=lambda row: row['conversation_id'])


def select_conversations(store: Store, filters: FilterSpec) -> list[dict]:
    filters = FilterSpec.model_validate(filters)
    latest = latest_evaluations(store, filters.dataset_id, CHECKLIST_VERSION)
    return [{**row, 'evaluation_id': latest[row['conversation_id']]['id'] if row['conversation_id'] in latest else None}
            for row in select_population(store, filters, latest)]


def observe(conversation_id: str, evaluation: dict | None) -> dict:
    state = {key: evaluation[key] for key in ('status', 'final', 'appeals', 'checklist_version_id')} if evaluation else None
    revision = hashlib.sha256(json.dumps(state, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()).hexdigest() if state else None
    return {'conversation_id': conversation_id, 'evaluation_id': evaluation['id'] if evaluation else None,
            'evaluation_status': evaluation['status'] if evaluation else 'unevaluated',
            'final': deepcopy(evaluation['final']) if evaluation else None, 'revision': revision}


def _counts(observations: list[dict]) -> dict:
    return {'selected': len(observations), 'evaluated': sum(row['evaluation_status'] == 'ok' for row in observations),
            'unevaluated': sum(row['evaluation_status'] == 'unevaluated' for row in observations),
            'failed': sum(row['evaluation_status'] == 'error' for row in observations)}


def _mean(values: list) -> float | None:
    if not values:
        return None
    mean = sum((Decimal(str(value)) for value in values), Decimal(0)) / len(values)
    return float(mean.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def _metrics(observations: list[dict], metric_ids: list[str]) -> dict:
    successful = [row['final'] for row in observations if row['evaluation_status'] == 'ok' and row['final'] is not None]
    result = {}
    for metric in metric_ids:
        if metric == 'final_score':
            values = [row['final_score'] for row in successful if row['final_score'] is not None]
            na_count = sum(row['final_score'] is None for row in successful)
        elif metric == 'critical':
            values = [100 if row['critical_flag'] else 0 for row in successful]
            na_count = 0
        else:
            criteria = [criterion for row in successful for criterion in row['criteria'] if criterion['criterion_id'] == metric]
            values = [Decimal(str(row['normalized_value'])) * 100 for row in criteria if row['applicable'] and row['normalized_value'] is not None]
            na_count = sum(not row['applicable'] for row in criteria)
        result[metric] = {'value': _mean(values), 'sample_count': len(values), 'na_count': na_count}
    return result


def _group_identity(row: dict, group_by: str) -> tuple[str, str]:
    if group_by == 'none':
        return 'all', 'All selected'
    if group_by in ('language', 'channel'):
        return row[group_by], row[group_by]
    stamp = local_start(row)
    if stamp is None:
        return 'unassigned', 'No assigned demo date'
    if group_by == 'date':
        return stamp.date().isoformat(), stamp.date().isoformat()
    if group_by == 'month_half':
        half = 'first_half' if stamp.day <= 15 else 'second_half'
        return stamp.strftime('%Y-%m') + ':' + half, stamp.strftime('%Y-%m') + (' days 1–15' if stamp.day <= 15 else ' days 16–end')
    if group_by == 'daypart':
        part = ('night', 'morning', 'afternoon', 'evening')[stamp.hour // 6]
        return part, part.capitalize()
    if group_by == 'day_night':
        return ('day', 'Day 06:00–18:00') if 6 <= stamp.hour < 18 else ('night', 'Night 18:00–06:00')
    holiday = stamp.date() in holiday_calendar(stamp.year)
    return ('holiday', 'Kazakhstan public or observed holiday') if holiday else ('non_holiday', 'Non-holiday')


def analyze(store: Store, spec: AnalysisSpec) -> dict:
    spec = AnalysisSpec.model_validate(spec)
    latest = latest_evaluations(store, spec.filters.dataset_id, CHECKLIST_VERSION)
    rows = select_population(store, spec.filters, latest)
    observations = [observe(row['conversation_id'], latest.get(row['conversation_id'])) for row in rows]
    by_id = {row['conversation_id']: row for row in observations}
    selections = []
    if spec.cohorts:
        for cohort in spec.cohorts:
            selections.append((cohort.key, cohort.label, cohort.filters.model_dump(exclude_none=True),
                               [row for row in rows if matches(row, cohort.filters, latest.get(row['conversation_id']))]))
    else:
        buckets = {}
        if spec.group_by == 'none':
            buckets[('all', 'All selected')] = []
        for row in rows:
            buckets.setdefault(_group_identity(row, spec.group_by), []).append(row)
        order = {'night': 0, 'morning': 1, 'afternoon': 2, 'evening': 3} if spec.group_by == 'daypart' else {}
        selections = [(key, label, None, members) for (key, label), members in sorted(
            buckets.items(), key=lambda item: (order.get(item[0][0], len(order)), item[0][0]))]
    groups = []
    for key, label, conditions, members in selections:
        ids = [row['conversation_id'] for row in members]
        selected = [by_id[id] for id in ids]
        groups.append({'key': key, 'label': label, 'conditions': conditions, 'conversation_ids': ids,
                       'counts': _counts(selected), 'metrics': _metrics(selected, spec.metric_ids)})
    definitions = {'calendar': deepcopy(CALENDAR), 'scheduling': scheduling_summary(rows),
                   'grouping': filtering_options(), 'metrics': {}}
    checklist = store.get('checklists', CHECKLIST_VERSION) or default_checklist()
    for metric in spec.metric_ids:
        definition = next((row for row in checklist['criteria'] if row['id'] == metric), None)
        definitions['metrics'][metric] = {'title': definition['title'] if definition else 'Mean final quality score',
            'unit': 'percent', 'calculation': 'Critical flag rate; does not zero quality scores' if metric == 'critical' else ('Mean final conversation score' if metric == 'final_score' else 'Mean normalized criterion fraction × 100 over applicable evaluated records'),
            'denominator': 'sample_count; failed and unevaluated excluded; N/A excluded and counted separately',
            'criterion': deepcopy(definition)}
    interpretation = [CALENDAR_RULE, CALENDAR['definition'],
        'All supplied predicates are AND; date/time end bounds are exclusive, score bounds inclusive. Hours with equal endpoints cover the full day.',
        'Latest cqa-v1 evaluation including errors; means exclude failed, unevaluated and N/A values.',
        'Global filters: ' + json.dumps(spec.filters.model_dump(exclude_none=True), ensure_ascii=False, sort_keys=True)]
    if spec.cohorts:
        interpretation.append('Each cohort intersects the global selection; groups may overlap. Root IDs are unique and remain the custom-metric target population.')
    output = {'spec': spec.model_dump(), 'checklist_version_id': CHECKLIST_VERSION,
              'conversation_ids': [row['conversation_id'] for row in rows],
              'evaluation_ids': [row['evaluation_id'] for row in observations if row['evaluation_id'] is not None],
              'observations': observations, 'counts': _counts(observations), 'definitions': definitions,
              'filter_interpretation': interpretation, 'groups': groups,
              'chart_series': [{'metric_id': metric, 'points': [{'key': group['key'], 'label': group['label'], **group['metrics'][metric]} for group in groups]} for metric in spec.metric_ids],
              'generated_at': now()}
    return AnalysisOutput.model_validate(output).model_dump()
