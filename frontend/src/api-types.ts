// Generated from docs/openapi.json. Run npm run generate:types after API changes.
export type Aggregate = {
  value: number | number | null;
  sample_count: number;
  na_count: number;
};

export type AnalysisCounts = {
  selected: number;
  evaluated: number;
  unevaluated: number;
  failed: number;
};

export type AnalysisGroup = {
  key: string;
  label: string;
  conditions: FilterConditions | null;
  conversation_ids: Array<string>;
  counts: AnalysisCounts;
  metrics: Record<string, Aggregate>;
};

export type AnalysisOutput = {
  spec: AnalysisSpec;
  checklist_version_id: string;
  conversation_ids: Array<string>;
  evaluation_ids: Array<string>;
  observations: Array<Observation>;
  counts: AnalysisCounts;
  definitions: Record<string, unknown>;
  filter_interpretation: Array<string>;
  groups: Array<AnalysisGroup>;
  chart_series: Array<ChartSeries>;
  generated_at: string;
};

export type AnalysisPatch = {
  target: AnalysisSpec;
  fields: Array<
    | "title"
    | "group_by"
    | "cohorts"
    | "metric_ids"
    | "filters.dataset_id"
    | "filters.channel"
    | "filters.language"
    | "filters.start_at"
    | "filters.end_at"
    | "filters.hours"
    | "filters.weekdays"
    | "filters.holiday"
    | "filters.min_score"
    | "filters.max_score"
    | "filters.critical"
  >;
};

export type AnalysisSpec = {
  filters?: FilterSpec;
  group_by?:
    | "none"
    | "date"
    | "month_half"
    | "daypart"
    | "day_night"
    | "holiday"
    | "language"
    | "channel";
  cohorts?: Array<ComparisonCohort> | null;
  metric_ids?: Array<
    | "final_score"
    | "contact"
    | "discovery"
    | "identification"
    | "consultation"
    | "empathy"
    | "dialogue"
    | "closure"
    | "critical"
  >;
  title: string;
};

export type Appeal = {
  id: string;
  evaluation_id: string;
  criterion_id: string;
  comment: string;
  status: "open" | "confirmed" | "changed";
  created_at: string;
  decision: AppealDecision | null;
};

export type AppealDecision = {
  action: "confirm" | "change";
  value: boolean | number | number | null;
  reason: string;
  created_at: string;
};

export type AppealPage = {
  items: Array<Appeal>;
  total: number;
};

export type AppealRequest = {
  evaluation_id: string;
  criterion_id: string;
  comment: string;
};

export type AssistantAction = {
  operation: "update_analysis" | "add_metric" | "rerun_metric" | "clarify";
  explanation: string;
  patch: AnalysisPatch | null;
  definition: CustomMetricDefinition | null;
  metric_id: string | null;
  question: string | null;
};

export type AssistantRequest = {
  content: string;
  report_id?: string | null;
};

export type AssistantResponse = {
  status: "ok" | "clarification" | "error";
  report_id: string;
  message: ReportMessage;
  spec: AnalysisSpec | null;
  output: AnalysisOutput | null;
  metric_run_id: string | null;
  action: AssistantAction | null;
  error: string | null;
};

export type BaselineExport = {
  schema_version: "1.0";
  team_name: string;
  model: ModelIdentity;
  results: Array<unknown>;
};

export type ChartPoint = {
  value: number | number | null;
  sample_count: number;
  na_count: number;
  key: string;
  label: string;
};

export type ChartSeries = {
  metric_id:
    | "final_score"
    | "contact"
    | "discovery"
    | "identification"
    | "consultation"
    | "empathy"
    | "dialogue"
    | "closure"
    | "critical";
  points: Array<ChartPoint>;
};

export type Checklist = {
  id: string;
  name: string;
  parent_version_id: string | null;
  instructions: string;
  criteria: Array<CriterionDefinition>;
};

export type ChecklistCreateRequest = {
  name: string;
  criteria: Array<CriterionDefinition>;
  parent_version_id?: string | null;
};

export type ChecklistPage = {
  items: Array<Checklist>;
  total: number;
};

export type ComparisonCohort = {
  key: string;
  label: string;
  filters: FilterConditions;
};

export type ConversationPage = {
  items: Array<ConversationResponse>;
  total: number;
};

export type ConversationResponse = {
  conversation_id: string;
  channel: "agent chat" | "voice call";
  language: "RU" | "KZ" | "EN";
  transcript: Array<SourceTurn>;
  audio_url: string | null;
  dataset_id: string;
  observed_span: ObservedSpan;
  demo_started_at: string | null;
  scheduling: Scheduling;
  evaluation_id: string | null;
};

export type CriterionDefinition = {
  id: string;
  title: string;
  description: string;
  answer_type: "boolean" | "scale";
  allowed_values: Array<boolean | number | number>;
  scale_meanings?: Record<string, string>;
  weight: number | number;
  allow_na: boolean;
  na_condition: string | null;
  critical: boolean;
};

export type CriterionJudgment = {
  criterion_id: string;
  value: boolean | number | number | null;
  rationale: string;
  evidence_turns: Array<number>;
};

export type CustomAssessment = {
  id: string;
  dataset_id: string;
  conversation_id: string;
  run_id: string;
  report_id: string;
  metric_id: string;
  metric_snapshot: CustomMetricDefinition;
  status: "ok" | "error";
  judgment: MetricJudgment | null;
  model: ModelIdentity;
  prompt_version: string;
  usage_attempt_ids: Array<string>;
  created_at: string;
  error: string | null;
  source_url: string;
};

export type CustomMetricDefinition = {
  id: string;
  title: string;
  description: string;
  answer_type: "boolean" | "scale";
  allowed_values: Array<boolean | number | number>;
  allow_na: boolean;
  na_condition: string | null;
};

export type DatasetImportRequest = {
  group_id: string;
  payload: SourceEnvelope;
  assign_demo_dates?: boolean;
};

export type DatasetImportResult = {
  dataset_id: string;
  total_records: number;
  assign_demo_dates: boolean;
  scheduling_seed: number | null;
};

export type DatasetSummary = {
  id: string;
  total_records: number;
};

export type DecisionRequest = {
  action: "confirm" | "change";
  value?: boolean | number | number | null;
  reason: string;
};

export type Evaluation = {
  id: string;
  dataset_id: string;
  conversation_id: string;
  run_id: string;
  status: "ok" | "error";
  checklist_version_id: string;
  checklist_snapshot: Checklist;
  model: ModelIdentity;
  prompt_version: string;
  original: ScoreResult | null;
  final: ScoreResult | null;
  usage_attempt_ids: Array<string>;
  created_at: string;
  error: string | null;
  appeals: Array<Appeal>;
};

export type ExportError = {
  conversation_id: string;
  status: "error";
  criteria: Array<CriterionJudgment>;
  score: null;
  error: string;
};

export type ExportScore = {
  final_score: number | number;
  critical_flag: boolean;
};

export type ExportSuccess = {
  conversation_id: string;
  status: "ok";
  criteria: Array<CriterionJudgment>;
  score: ExportScore;
};

export type FilterConditions = {
  channel?: "agent chat" | "voice call" | null;
  language?: "RU" | "KZ" | "EN" | null;
  start_at?: string | null;
  end_at?: string | null;
  hours?: Hours | null;
  weekdays?: Array<number> | null;
  holiday?: boolean | null;
  min_score?: number | number | null;
  max_score?: number | number | null;
  critical?: boolean | null;
};

export type FilterSpec = {
  channel?: "agent chat" | "voice call" | null;
  language?: "RU" | "KZ" | "EN" | null;
  start_at?: string | null;
  end_at?: string | null;
  hours?: Hours | null;
  weekdays?: Array<number> | null;
  holiday?: boolean | null;
  min_score?: number | number | null;
  max_score?: number | number | null;
  critical?: boolean | null;
  dataset_id?: string;
};

export type HTTPValidationError = {
  detail?: Array<ValidationError>;
};

export type HealthResponse = {
  status: "ok";
};

export type Hours = {
  start: number;
  end: number;
};

export type MessageRequest = {
  content: string;
};

export type MetaResponse = {
  reporting_timezone: string;
  channels: Array<"agent chat" | "voice call">;
  languages: Array<"RU" | "KZ" | "EN">;
  default_checklist_version_id: string;
  datasets: Array<DatasetSummary>;
  scheduling: Record<string, unknown>;
  holiday_calendar: Record<string, unknown>;
  implemented_features: Array<string>;
  available_periods: Array<string>;
  filtering_options: Record<string, unknown>;
};

export type MetricAggregate = {
  value: number | null;
  unit: "percent_true" | "raw_scale";
  selected_count: number;
  assessed_count: number;
  sample_count: number;
  na_count: number;
  failed_count: number;
  pending_count: number;
  cancelled_count: number;
  interrupted_count: number;
  uncovered_count: number;
  distribution: Record<string, number>;
};

export type MetricGroup = {
  key: string;
  label: string;
  aggregate: MetricAggregate;
};

export type MetricJudgment = {
  value: boolean | number | number | null;
  rationale: string;
  evidence_turns: Array<number>;
};

export type ModelIdentity = {
  mode: "external_api" | "local" | "hybrid";
  name: string;
};

export type Observation = {
  conversation_id: string;
  evaluation_id: string | null;
  evaluation_status: "ok" | "error" | "unevaluated";
  final: ScoreResult | null;
  revision: string | null;
};

export type ObservedSpan = {
  kind: "elapsed" | "calendar";
  started_at: string;
  ended_at: string;
  duration_seconds: number;
};

export type Report = {
  id: string;
  title: string;
  status?: "draft" | "ready";
  spec: AnalysisSpec | null;
  output: AnalysisOutput | null;
  created_at: string;
  updated_at: string;
  messages: Array<ReportMessage>;
  custom_metrics: Array<ReportMetric>;
  stale: boolean;
};

export type ReportMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  usage_attempt_ids?: Array<string>;
};

export type ReportMetric = {
  definition: CustomMetricDefinition;
  run_ids: Array<string>;
  latest_run_id: string | null;
  status:
    | "not_run"
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "interrupted"
    | "cancelled";
  runs: Array<Run>;
  results: Array<CustomAssessment>;
  aggregate: MetricAggregate;
  out_of_scope_count: number;
  groups: Array<MetricGroup>;
};

export type ReportPage = {
  items: Array<Report>;
  total: number;
};

export type Run = {
  id: string;
  kind: "evaluation" | "custom_metric";
  dataset_id: string;
  conversation_ids: Array<string>;
  checklist_version_id: string | null;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "interrupted"
    | "cancelled";
  total: number;
  completed: number;
  failed: number;
  items: Array<RunItem>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  model: ModelIdentity;
  checklist_snapshot: Checklist | null;
  report_id?: string | null;
  metric_snapshot?: CustomMetricDefinition | null;
  selection_spec?: Record<string, unknown> | null;
  selection_generated_at?: string | null;
};

export type RunItem = {
  conversation_id: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "interrupted"
    | "cancelled";
  evaluation_id: string | null;
  assessment_id?: string | null;
  error: string | null;
};

export type RunRequest = {
  dataset_id: string;
  conversation_ids: Array<string>;
  checklist_version_id: string;
};

export type Scheduling = {
  mode: "assigned_demo" | "source_only";
  seed: number | null;
  algorithm: string | null;
  timezone: string;
  period: string | null;
  independent_of_scores: boolean;
  interpretation: string;
};

export type ScoreResult = {
  criteria: Array<ScoredCriterion>;
  earned_points: number | number;
  applicable_weight: number | number;
  final_score: number | number | null;
  critical_flag: boolean;
};

export type ScoredCriterion = {
  criterion_id: string;
  value: boolean | number | number | null;
  rationale: string;
  evidence_turns: Array<number>;
  weight: number | number;
  applicable: boolean;
  normalized_value: number | number | null;
  points: number | number | null;
  weighted_score: number | number | null;
};

export type SourceConversation = {
  conversation_id: string;
  channel: "agent chat" | "voice call";
  language: "RU" | "KZ" | "EN";
  transcript: Array<SourceTurn>;
  audio_url: string | null;
};

export type SourceData = {
  dataset_group_id: string;
  total_records: number;
  records: Array<SourceConversation>;
};

export type SourceEnvelope = {
  error: string;
  isSuccess: boolean;
  data: SourceData;
};

export type SourceTurn = {
  timestamp: string;
  speaker: "client" | "operator" | "bot" | "system";
  text: string;
};

export type UsageAttempt = {
  id: string;
  run_id: string | null;
  purpose: string;
  model: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  latency_ms: number | null;
  provider_request_id: string | null;
  provider_message_id: string | null;
  raw_usage: Record<string, unknown> | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | number | null;
  reserved_usd: number | number;
  reservation_usd: number | number;
  allowance: "working" | "control";
  max_tokens: number | null;
  rates: Record<string, unknown>;
  error: string | null;
  stop_reason: string | null;
  stop_details: Record<string, unknown> | null;
};

export type UsageSummary = {
  currency: "USD";
  hard_limit_usd: number | number;
  working_limit_usd: number | number;
  control_reserve_usd: number | number;
  spent_usd: number | number;
  reserved_usd: number | number;
  remaining_usd: number | number;
  working_remaining_usd: number | number;
  attempts: Array<UsageAttempt>;
};

export type ValidationError = {
  loc: Array<string | number>;
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
};
