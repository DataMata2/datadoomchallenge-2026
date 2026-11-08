"""Strict allowlisted deterministic selection, aggregate and report contracts."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StrictBool, StrictFloat, StrictInt, StrictStr, field_validator, model_validator

from .models import Channel, Language, NonemptyString, ScoreResult, StrictModel
from .metric_models import ReportMetric

Percentage = Annotated[StrictInt, Field(ge=0, le=100)] | Annotated[StrictFloat, Field(ge=0, le=100, allow_inf_nan=False)]
Hour = Annotated[StrictInt, Field(ge=0, le=23)]
MetricId = Literal['final_score', 'contact', 'discovery', 'identification', 'consultation', 'empathy', 'dialogue', 'closure', 'critical']
GroupBy = Literal['none', 'date', 'month_half', 'daypart', 'day_night', 'holiday', 'language', 'channel']
BASELINE_METRICS = ['final_score', 'contact', 'discovery', 'identification', 'consultation', 'empathy', 'dialogue', 'closure', 'critical']
GROUP_OPTIONS = ['none', 'date', 'month_half', 'daypart', 'day_night', 'holiday', 'language', 'channel']


class Hours(StrictModel):
    start: Hour
    end: Hour


class FilterConditions(StrictModel):
    channel: Channel | None = None
    language: Language | None = None
    start_at: StrictStr | None = None
    end_at: StrictStr | None = None
    hours: Hours | None = None
    weekdays: Annotated[list[Annotated[StrictInt, Field(ge=1, le=7)]], Field(min_length=1, max_length=7)] | None = None
    holiday: StrictBool | None = None
    min_score: Percentage | None = None
    max_score: Percentage | None = None
    critical: StrictBool | None = None

    @field_validator('start_at', 'end_at')
    @classmethod
    def aware_instant(cls, value):
        if value is not None:
            try:
                parsed = datetime.fromisoformat(value)
            except ValueError:
                raise ValueError('Calendar bounds must be ISO 8601 timestamps with timezone') from None
            if 'T' not in value or parsed.tzinfo is None or parsed.utcoffset() is None:
                raise ValueError('Calendar bounds must include an explicit timezone')
        return value

    @model_validator(mode='after')
    def valid_intervals(self):
        if self.start_at and self.end_at and datetime.fromisoformat(self.start_at) >= datetime.fromisoformat(self.end_at):
            raise ValueError('start_at must be earlier than the exclusive end_at')
        if self.min_score is not None and self.max_score is not None and self.min_score > self.max_score:
            raise ValueError('min_score must not exceed max_score')
        if self.weekdays and len(set(self.weekdays)) != len(self.weekdays):
            raise ValueError('ISO weekdays must be unique')
        return self


class FilterSpec(FilterConditions):
    dataset_id: NonemptyString = 'DEV'


class ComparisonCohort(StrictModel):
    key: Annotated[StrictStr, Field(pattern=r'^[a-zA-Z][a-zA-Z0-9_-]{0,63}$')]
    label: NonemptyString
    filters: FilterConditions


class AnalysisSpec(StrictModel):
    filters: FilterSpec = Field(default_factory=FilterSpec)
    group_by: GroupBy = 'none'
    cohorts: Annotated[list[ComparisonCohort], Field(min_length=1, max_length=4)] | None = None
    metric_ids: Annotated[list[MetricId], Field(min_length=1)] = Field(default_factory=lambda: BASELINE_METRICS.copy())
    title: NonemptyString

    @field_validator('title')
    @classmethod
    def nonblank_title(cls, value):
        if not value.strip():
            raise ValueError('Analysis title must contain non-whitespace text')
        return value

    @model_validator(mode='after')
    def valid_comparison(self):
        if len(set(self.metric_ids)) != len(self.metric_ids):
            raise ValueError('Metric IDs must be unique')
        if self.cohorts is not None:
            if self.group_by != 'none':
                raise ValueError('Explicit cohorts require group_by none')
            if len({c.key for c in self.cohorts}) != len(self.cohorts):
                raise ValueError('Cohort keys must be unique')
        return self


class AnalysisCounts(StrictModel):
    selected: Annotated[StrictInt, Field(ge=0)]
    evaluated: Annotated[StrictInt, Field(ge=0)]
    unevaluated: Annotated[StrictInt, Field(ge=0)]
    failed: Annotated[StrictInt, Field(ge=0)]


class Aggregate(StrictModel):
    value: Percentage | None
    sample_count: Annotated[StrictInt, Field(ge=0)]
    na_count: Annotated[StrictInt, Field(ge=0)]


class Observation(StrictModel):
    conversation_id: StrictStr
    evaluation_id: StrictStr | None
    evaluation_status: Literal['ok', 'error', 'unevaluated']
    final: ScoreResult | None
    revision: StrictStr | None


class AnalysisGroup(StrictModel):
    key: StrictStr
    label: StrictStr
    conditions: FilterConditions | None
    conversation_ids: list[StrictStr]
    counts: AnalysisCounts
    metrics: dict[MetricId, Aggregate]


class ChartPoint(Aggregate):
    key: StrictStr
    label: StrictStr


class ChartSeries(StrictModel):
    metric_id: MetricId
    points: list[ChartPoint]


class AnalysisOutput(StrictModel):
    spec: AnalysisSpec
    checklist_version_id: StrictStr
    conversation_ids: list[StrictStr]
    evaluation_ids: list[StrictStr]
    observations: list[Observation]
    counts: AnalysisCounts
    definitions: dict
    filter_interpretation: list[StrictStr]
    groups: list[AnalysisGroup]
    chart_series: list[ChartSeries]
    generated_at: StrictStr


class ReportMessage(StrictModel):
    analysis_language: Language = "EN"
    id: StrictStr
    role: Literal['user', 'assistant']
    content: StrictStr
    created_at: StrictStr
    usage_attempt_ids: list[StrictStr] = Field(default_factory=list)


class Report(StrictModel):
    id: StrictStr
    title: StrictStr
    status: Literal['draft', 'ready'] = 'ready'
    spec: AnalysisSpec | None
    output: AnalysisOutput | None
    created_at: StrictStr
    updated_at: StrictStr
    messages: list[ReportMessage]
    custom_metrics: list[ReportMetric]
    stale: StrictBool

    @model_validator(mode='after')
    def valid_status(self):
        if self.status == 'draft' and (self.spec is not None or self.output is not None or self.stale):
            raise ValueError('Draft reports have no saved analysis and cannot be stale')
        if self.status == 'ready' and (self.spec is None or self.output is None):
            raise ValueError('Ready reports require both a spec and output')
        return self


class ReportPage(StrictModel):
    items: list[Report]
    total: StrictInt
