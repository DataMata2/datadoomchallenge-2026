"""Strict source and assessment boundary models."""

from decimal import Decimal
from math import isfinite
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, StrictStr, field_validator, model_validator

Channel = Literal["agent chat", "voice call"]
Language = Literal["RU", "KZ", "EN"]
RawValue = StrictBool | StrictInt | StrictFloat | None
NonemptyString = Annotated[StrictStr, Field(min_length=1)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SourceTurn(StrictModel):
    timestamp: NonemptyString
    speaker: Literal["client", "operator", "bot", "system"]
    text: StrictStr


class SourceConversation(StrictModel):
    conversation_id: NonemptyString
    channel: Channel
    language: Language
    transcript: Annotated[list[SourceTurn], Field(min_length=1)]
    audio_url: StrictStr | None


class SourceData(StrictModel):
    dataset_group_id: NonemptyString
    total_records: Annotated[StrictInt, Field(ge=0)]
    records: list[SourceConversation]


class SourceEnvelope(StrictModel):
    error: StrictStr
    isSuccess: StrictBool
    data: SourceData


class DatasetImportRequest(StrictModel):
    group_id: NonemptyString
    payload: SourceEnvelope
    assign_demo_dates: StrictBool = True


class CriterionJudgment(StrictModel):
    criterion_id: NonemptyString
    value: RawValue
    rationale: NonemptyString
    evidence_turns: Annotated[list[StrictInt], Field(min_length=1)]

    @field_validator("rationale")
    @classmethod
    def rationale_has_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Rationale must contain non-whitespace text")
        return value


class CriterionDefinition(StrictModel):
    id: Annotated[StrictStr, Field(pattern=r"^[a-z][a-z0-9_-]{0,63}$")]
    title: NonemptyString
    description: NonemptyString
    answer_type: Literal["boolean", "scale"]
    allowed_values: list[StrictBool | StrictInt | StrictFloat]
    scale_meanings: dict[str, NonemptyString] = Field(default_factory=dict)
    weight: Annotated[StrictInt, Field(ge=0)] | Annotated[StrictFloat, Field(ge=0, allow_inf_nan=False)]
    allow_na: StrictBool
    na_condition: StrictStr | None
    critical: StrictBool

    @field_validator("weight", "allowed_values", mode="before")
    @classmethod
    def finite_numbers(cls, value):
        for number in value if isinstance(value, list) else [value]:
            if type(number) in (int, float):
                try:
                    finite = isfinite(number)
                except OverflowError:
                    finite = False
                if not finite:
                    raise ValueError("Weights and scale steps must be finite representable numbers")
        return value

    @field_validator("title", "description")
    @classmethod
    def text_has_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Criterion text must contain non-whitespace text")
        return value

    @model_validator(mode="after")
    def valid_definition(self):
        allowed = self.allowed_values
        if self.answer_type == "boolean":
            if len(allowed) != 2 or any(type(v) is not bool for v in allowed) or set(allowed) != {False, True}:
                raise ValueError("Boolean criteria must allow false and true exactly once")
        elif (not allowed or any(type(v) not in (int, float) or not isfinite(v) or v < 0 for v in allowed)
              or len(set(allowed)) != len(allowed) or max(allowed) <= 0):
            raise ValueError("Numeric scales require unique finite nonnegative steps and a positive maximum")
        if self.allow_na:
            if not self.na_condition or not self.na_condition.strip():
                raise ValueError("N/A requires an explicit nonempty applicability condition")
        elif self.na_condition is not None:
            raise ValueError("na_condition must be null when N/A is disabled")
        if self.critical and (self.answer_type != "boolean" or self.weight != 0 or self.allow_na):
            raise ValueError("Critical criteria must be unscored non-null booleans")
        return self


def validate_aggregate_weight(criteria: list[CriterionDefinition]) -> None:
    """Reject configurations whose maximum applicable weight cannot be serialized."""
    total = sum((Decimal(str(criterion.weight)) for criterion in criteria), Decimal(0))
    if not isfinite(float(total)):
        raise ValueError("Aggregate criterion weight must be finite and representable")


class ChecklistCreateRequest(StrictModel):
    name: NonemptyString
    criteria: Annotated[list[CriterionDefinition], Field(min_length=1)]
    parent_version_id: NonemptyString | None = None

    @field_validator("name")
    @classmethod
    def name_has_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Checklist name must contain non-whitespace text")
        return value

    @model_validator(mode="after")
    def valid_criteria(self):
        ids = [c.id for c in self.criteria]
        if len(set(ids)) != len(ids):
            raise ValueError("Criterion IDs must be unique")
        if not any(c.weight > 0 and not c.critical for c in self.criteria):
            raise ValueError("A checklist requires at least one positively weighted criterion")
        validate_aggregate_weight(self.criteria)
        return self


class AppealRequest(StrictModel):
    evaluation_id: NonemptyString
    criterion_id: NonemptyString
    comment: NonemptyString

    @field_validator("comment")
    @classmethod
    def comment_has_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("An appeal requires a nonempty comment")
        return value


class DecisionRequest(StrictModel):
    action: Literal["confirm", "change"]
    value: RawValue = None
    reason: NonemptyString

    @field_validator("reason")
    @classmethod
    def reason_has_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A decision requires a nonempty reason")
        return value

    @model_validator(mode="after")
    def valid_value_presence(self):
        if self.action == "change" and "value" not in self.model_fields_set:
            raise ValueError("A change requires an explicit value; use null only for permitted N/A")
        if self.action == "confirm" and "value" in self.model_fields_set:
            raise ValueError("Confirmation accepts no override value; use action change")
        return self


class AppealDecision(StrictModel):
    action: Literal["confirm", "change"]
    value: RawValue
    reason: NonemptyString
    created_at: StrictStr


class Appeal(StrictModel):
    id: StrictStr
    evaluation_id: StrictStr
    criterion_id: StrictStr
    comment: NonemptyString
    status: Literal["open", "confirmed", "changed"]
    created_at: StrictStr
    decision: AppealDecision | None


class AppealPage(StrictModel):
    items: list[Appeal]
    total: StrictInt


class Checklist(StrictModel):
    id: NonemptyString
    name: NonemptyString
    parent_version_id: StrictStr | None
    instructions: NonemptyString
    criteria: list[CriterionDefinition]


class ChecklistPage(StrictModel):
    items: list[Checklist]
    total: StrictInt


class ObservedSpan(StrictModel):
    kind: Literal["elapsed", "calendar"]
    started_at: StrictStr
    ended_at: StrictStr
    duration_seconds: StrictFloat


class Scheduling(StrictModel):
    mode: Literal["assigned_demo", "source_only"]
    seed: StrictInt | None
    algorithm: StrictStr | None
    timezone: StrictStr
    period: StrictStr | None
    independent_of_scores: StrictBool
    interpretation: StrictStr


class ConversationResponse(SourceConversation):
    dataset_id: StrictStr
    observed_span: ObservedSpan
    demo_started_at: StrictStr | None
    scheduling: Scheduling
    evaluation_id: StrictStr | None


class ConversationPage(StrictModel):
    items: list[ConversationResponse]
    total: StrictInt


class DatasetImportResult(StrictModel):
    dataset_id: StrictStr
    total_records: StrictInt
    assign_demo_dates: StrictBool
    scheduling_seed: StrictInt | None


class HealthResponse(StrictModel):
    status: Literal["ok"]


class DatasetSummary(StrictModel):
    id: StrictStr
    total_records: StrictInt


class MetaResponse(StrictModel):
    reporting_timezone: StrictStr
    channels: list[Channel]
    languages: list[Language]
    default_checklist_version_id: StrictStr
    datasets: list[DatasetSummary]
    scheduling: dict
    holiday_calendar: dict
    implemented_features: list[StrictStr]
    available_periods: list[StrictStr]
    filtering_options: dict


class ScoredCriterion(CriterionJudgment):
    weight: StrictInt | StrictFloat
    applicable: StrictBool
    normalized_value: StrictInt | StrictFloat | None
    points: StrictInt | StrictFloat | None
    weighted_score: StrictInt | StrictFloat | None


class ScoreResult(StrictModel):
    criteria: list[ScoredCriterion]
    earned_points: StrictInt | StrictFloat
    applicable_weight: StrictInt | StrictFloat
    final_score: StrictInt | StrictFloat | None
    critical_flag: StrictBool


class ModelIdentity(StrictModel):
    mode: Literal["external_api", "local", "hybrid"]
    name: StrictStr


class CustomMetricDefinition(StrictModel):
    id: Annotated[StrictStr, Field(pattern=r"^[a-z][a-z0-9_-]{0,63}$")]
    title: NonemptyString
    description: NonemptyString
    answer_type: Literal["boolean", "scale"]
    allowed_values: Annotated[list[StrictBool | StrictInt | Annotated[StrictFloat, Field(allow_inf_nan=False)]], Field(min_length=1, max_length=64)]
    allow_na: StrictBool
    na_condition: StrictStr | None

    @field_validator("title", "description")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Metric text must contain non-whitespace text")
        return value

    @field_validator("allowed_values", mode="before")
    @classmethod
    def finite_domain(cls, values):
        if isinstance(values, list):
            for value in values:
                if type(value) in (int, float):
                    try:
                        finite = isfinite(value)
                    except OverflowError:
                        finite = False
                    if not finite:
                        raise ValueError("Metric values must be finite representable numbers")
        return values

    @model_validator(mode="after")
    def valid_domain(self):
        values = self.allowed_values
        if self.answer_type == "boolean":
            if len(values) != 2 or any(type(v) is not bool for v in values) or set(values) != {False, True}:
                raise ValueError("Boolean metrics require false and true exactly once")
        elif any(type(v) not in (int, float) or not isfinite(v) or v < 0 for v in values) or len(set(values)) != len(values):
            raise ValueError("Numeric metrics require unique finite nonnegative discrete values")
        if self.allow_na:
            if not self.na_condition or not self.na_condition.strip():
                raise ValueError("N/A requires an explicit nonempty condition")
        elif self.na_condition is not None:
            raise ValueError("na_condition must be null when N/A is disabled")
        return self


RunStatus = Literal["queued", "running", "completed", "failed", "interrupted", "cancelled"]


class RunRequest(StrictModel):
    dataset_id: NonemptyString
    conversation_ids: Annotated[list[NonemptyString], Field(min_length=1, max_length=500)]
    checklist_version_id: NonemptyString


class RunItem(StrictModel):
    conversation_id: StrictStr
    status: RunStatus
    evaluation_id: StrictStr | None
    assessment_id: StrictStr | None = None
    error: StrictStr | None


class Run(StrictModel):
    id: StrictStr
    kind: Literal["evaluation", "custom_metric"]
    dataset_id: StrictStr
    conversation_ids: list[StrictStr]
    checklist_version_id: StrictStr | None
    status: RunStatus
    total: StrictInt
    completed: StrictInt
    failed: StrictInt
    items: list[RunItem]
    created_at: StrictStr
    started_at: StrictStr | None
    finished_at: StrictStr | None
    error: StrictStr | None
    model: ModelIdentity
    checklist_snapshot: Checklist | None
    report_id: StrictStr | None = None
    metric_snapshot: CustomMetricDefinition | None = None
    selection_spec: dict | None = None
    selection_generated_at: StrictStr | None = None

    @model_validator(mode="after")
    def valid_kind(self):
        if self.kind == "custom_metric":
            if self.checklist_snapshot is not None or self.checklist_version_id is not None or self.metric_snapshot is None or self.report_id is None or self.selection_spec is None or self.selection_generated_at is None:
                raise ValueError("Custom runs require a report, metric and saved selection; checklist fields must be null")
            if any(item.evaluation_id is not None for item in self.items):
                raise ValueError("Custom runs use assessment IDs")
        elif self.checklist_snapshot is None or self.checklist_version_id is None or any(item.assessment_id is not None for item in self.items):
            raise ValueError("Evaluation runs require a checklist and evaluation IDs")
        return self


class Evaluation(StrictModel):
    id: StrictStr
    dataset_id: StrictStr
    conversation_id: StrictStr
    run_id: StrictStr
    status: Literal["ok", "error"]
    checklist_version_id: StrictStr
    checklist_snapshot: Checklist
    model: ModelIdentity
    prompt_version: StrictStr
    original: ScoreResult | None
    final: ScoreResult | None
    usage_attempt_ids: list[StrictStr]
    created_at: StrictStr
    error: StrictStr | None
    appeals: list[Appeal]


class UsageAttempt(StrictModel):
    id: StrictStr
    run_id: StrictStr | None
    purpose: StrictStr
    model: StrictStr
    status: StrictStr
    started_at: StrictStr
    finished_at: StrictStr | None
    latency_ms: StrictInt | None
    provider_request_id: StrictStr | None
    provider_message_id: StrictStr | None
    raw_usage: dict | None
    input_tokens: StrictInt | None
    output_tokens: StrictInt | None
    cost_usd: StrictInt | StrictFloat | None
    reserved_usd: StrictInt | StrictFloat
    reservation_usd: StrictInt | StrictFloat
    allowance: Literal["working", "control"]
    max_tokens: StrictInt | None
    rates: dict
    error: StrictStr | None
    stop_reason: StrictStr | None
    stop_details: dict | None


class UsageSummary(StrictModel):
    currency: Literal["USD"]
    hard_limit_usd: StrictInt | StrictFloat
    working_limit_usd: StrictInt | StrictFloat
    control_reserve_usd: StrictInt | StrictFloat
    spent_usd: StrictInt | StrictFloat
    reserved_usd: StrictInt | StrictFloat
    remaining_usd: StrictInt | StrictFloat
    working_remaining_usd: StrictInt | StrictFloat
    attempts: list[UsageAttempt]


class ExportScore(StrictModel):
    final_score: Annotated[StrictInt, Field(ge=0, le=100)] | Annotated[StrictFloat, Field(ge=0, le=100, allow_inf_nan=False)]
    critical_flag: StrictBool


class ExportSuccess(StrictModel):
    conversation_id: NonemptyString
    status: Literal["ok"]
    criteria: list[CriterionJudgment]
    score: ExportScore


class ExportError(StrictModel):
    conversation_id: NonemptyString
    status: Literal["error"]
    criteria: Annotated[list[CriterionJudgment], Field(max_length=0)]
    score: None
    error: NonemptyString


class BaselineExport(StrictModel):
    schema_version: Literal["1.0"]
    team_name: NonemptyString
    model: ModelIdentity
    results: list[Annotated[ExportSuccess | ExportError, Field(discriminator="status")]]

    @field_validator("team_name")
    @classmethod
    def team_has_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Provide the official nonempty team_name explicitly")
        return value
