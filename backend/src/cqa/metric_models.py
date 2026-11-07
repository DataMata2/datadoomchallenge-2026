"""Typed independent metric results and saved report coverage."""

from typing import Annotated, Literal

from pydantic import Field, StrictBool, StrictFloat, StrictInt, StrictStr, model_validator

from .models import CustomMetricDefinition, ModelIdentity, Run, StrictModel


class MetricJudgment(StrictModel):
    value: StrictBool | StrictInt | Annotated[StrictFloat, Field(allow_inf_nan=False)] | None
    rationale: Annotated[StrictStr, Field(min_length=1, max_length=4000)]
    evidence_turns: Annotated[list[Annotated[StrictInt, Field(ge=1)]], Field(min_length=1)]

    @model_validator(mode='after')
    def valid_text_evidence(self):
        if not self.rationale.strip() or len(set(self.evidence_turns)) != len(self.evidence_turns):
            raise ValueError('A rationale and unique evidence turns are required')
        return self


class CustomAssessment(StrictModel):
    id: StrictStr
    dataset_id: StrictStr
    conversation_id: StrictStr
    run_id: StrictStr
    report_id: StrictStr
    metric_id: StrictStr
    metric_snapshot: CustomMetricDefinition
    status: Literal['ok', 'error']
    judgment: MetricJudgment | None
    model: ModelIdentity
    prompt_version: StrictStr
    usage_attempt_ids: list[StrictStr]
    created_at: StrictStr
    error: StrictStr | None
    source_url: StrictStr


class MetricAggregate(StrictModel):
    value: Annotated[StrictFloat, Field(allow_inf_nan=False)] | None
    unit: Literal['percent_true', 'raw_scale']
    selected_count: StrictInt
    assessed_count: StrictInt
    sample_count: StrictInt
    na_count: StrictInt
    failed_count: StrictInt
    pending_count: StrictInt
    cancelled_count: StrictInt
    interrupted_count: StrictInt
    uncovered_count: StrictInt
    distribution: dict[str, StrictInt]


class MetricGroup(StrictModel):
    key: StrictStr
    label: StrictStr
    aggregate: MetricAggregate


class ReportMetric(StrictModel):
    definition: CustomMetricDefinition
    run_ids: list[StrictStr]
    latest_run_id: StrictStr | None
    status: Literal['not_run', 'queued', 'running', 'completed', 'failed', 'interrupted', 'cancelled']
    runs: list[Run]
    results: list[CustomAssessment]
    aggregate: MetricAggregate
    out_of_scope_count: StrictInt
    groups: list[MetricGroup]
