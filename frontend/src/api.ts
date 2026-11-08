/** Replaceable transport layer. Source text is rendered only as escaped React text. */
import type {
  AnalysisSpec,
  AnalysisOutput,
  FilterSpec,
  ConversationResponse,
  ConversationPage,
  MetaResponse,
  ChecklistPage,
  Checklist,
  ChecklistCreateRequest,
  ReportPage,
  Report,
  AssistantResponse,
  Run,
  RunRequest,
  Evaluation,
  Appeal,
  AppealRequest,
  DecisionRequest,
  UsageSummary,
  CustomMetricDefinition,
  Observation,
  DatasetImportRequest,
  DatasetImportResult,
  WorkspaceSettings,
} from "./api-types";
export * from "./api-types";
export type SavedObservation = {
  observation: Observation;
  generatedAt: string;
  checklistVersionId: string;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = result?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map(
                (e: { loc: string[]; msg: string }) =>
                  `${e.loc.join(".")}: ${e.msg}`,
              )
              .join("; ")
          : `Ошибка запроса (${response.status}). Проверьте доступность API.`;
    throw new ApiError(response.status, message);
  }
  return result as T;
}
const id = encodeURIComponent;
export const api = {
  settings: () => request<WorkspaceSettings>("/settings"),
  saveSettings: (settings: WorkspaceSettings) =>
    request<WorkspaceSettings>("/settings", settings),
  importDataset: (body: DatasetImportRequest) =>
    request<DatasetImportResult>("/datasets/import", body),
  meta: () => request<MetaResponse>("/meta"),
  usage: () => request<UsageSummary>("/usage"),
  search: (filters: FilterSpec) =>
    request<ConversationPage>("/conversations/search", filters),
  analytics: (spec: AnalysisSpec) =>
    request<AnalysisOutput>("/analytics", spec),
  conversation: (dataset: string, sourceId: string, checklist = "cqa-v1") =>
    request<ConversationResponse>(
      `/conversations/${id(sourceId)}?dataset_id=${id(dataset)}&checklist_version_id=${id(checklist)}`,
    ),
  evaluation: (evaluationId: string) =>
    request<Evaluation>(`/evaluations/${id(evaluationId)}`),
  checklists: () => request<ChecklistPage>("/checklists"),
  saveChecklist: (body: ChecklistCreateRequest) =>
    request<Checklist>("/checklists", body),
  reports: () => request<ReportPage>("/reports"),
  report: (reportId: string) => request<Report>(`/reports/${id(reportId)}`),
  saveReport: (spec: AnalysisSpec) => request<Report>("/reports", spec),
  refreshReport: (reportId: string) =>
    request<Report>(`/reports/${id(reportId)}/refresh`, {}),
  assistant: (content: string, reportId?: string) =>
    request<AssistantResponse>("/assistant", {
      content,
      ...(reportId ? { report_id: reportId } : {}),
    }),
  startRun: (body: RunRequest) => request<Run>("/runs", body),
  run: (runId: string) => request<Run>(`/runs/${id(runId)}`),
  cancelRun: (runId: string) => request<Run>(`/runs/${id(runId)}/cancel`, {}),
  appeal: (body: AppealRequest) => request<Appeal>("/appeals", body),
  decide: (appealId: string, body: DecisionRequest) =>
    request<Appeal>(`/appeals/${id(appealId)}/decision`, body),
  startMetric: (reportId: string, body: CustomMetricDefinition) =>
    request<Run>(`/reports/${id(reportId)}/metrics`, body),
  rerunMetric: (reportId: string, metricId: string) =>
    request<Run>(`/reports/${id(reportId)}/metrics/${id(metricId)}/runs`, {}),
};
