"""Strict source and assessment boundary models."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, StrictStr, field_validator

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
    id: NonemptyString
    title: NonemptyString
    description: NonemptyString
    answer_type: Literal["boolean", "scale"]
    allowed_values: list[StrictBool | StrictInt | StrictFloat]
    scale_meanings: dict[str, StrictStr]
    weight: StrictInt | StrictFloat
    allow_na: StrictBool
    na_condition: StrictStr | None
    critical: StrictBool


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
