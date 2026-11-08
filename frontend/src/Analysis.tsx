import { message, t } from "./i18n";
import { groupLabel, criterionDisplay } from "./locale";
import { useId, useState } from "react";
import Icon from "./Icon";
import type {
  AnalysisOutput,
  AnalysisGroup,
  Checklist,
  ConversationResponse,
  SavedObservation,
} from "./api";
import {
  ConversationTable,
  Dialog,
  Empty,
  FilterChips,
  metricNames,
  raw,
  score,
} from "./ui";
type Props = {
  output: AnalysisOutput;
  comparison?: AnalysisOutput | null;
  sources: ConversationResponse[];
  checklist?: Checklist;
  saved?: boolean;
  open: (
    id: string,
    metric?: string,
    turns?: number[],
    saved?: SavedObservation,
  ) => void;
};
export default function Analysis({
  output,
  comparison,
  sources,
  checklist,
  open: openSource,
  saved = false,
}: Props) {
  const open = (id: string, metric?: string, turns?: number[]) => {
    const observation = output.observations.find(
      (row) => row.conversation_id === id,
    );
    const snapshot =
      saved && observation
        ? {
            observation,
            generatedAt: output.generated_at,
            checklistVersionId: output.checklist_version_id,
          }
        : undefined;
    if (snapshot) openSource(id, metric, turns, snapshot);
    else openSource(id, metric, turns);
  };
  const [inspect, setInspect] = useState<{
    metric: string;
    group: AnalysisGroup;
  } | null>(null);
  const [groupKey, setGroupKey] = useState("");
  const [chartMetric, setChartMetric] = useState("final_score");
  const [tab, setTab] = useState<"analytics" | "conversations">(
    saved ? "analytics" : "conversations",
  );
  const tabId = useId();
  const aggregate =
    output.groups.find((g) => g.key === groupKey) || output.groups[0];
  const chartId =
    comparison?.spec.metric_ids?.find((id) => id === chartMetric) ||
    comparison?.spec.metric_ids?.[0] ||
    "final_score";
  return (
    <>
      <div className="stat-strip">
        <div className="stat-card">
          <span className="stat-label">
            {t("Selected conversations")}
            <Icon name="chat" size={18} />
          </span>
          <strong>{output.counts.selected}</strong>
          <span>{t("Across the current selection")}</span>
        </div>
        <div className="stat-card featured">
          <span className="stat-label">
            {t("Average quality score")}
            <Icon name="sparkle" size={18} />
          </span>
          <strong
            className={
              aggregate?.metrics.final_score?.value == null
                ? "unknown-stat"
                : ""
            }
          >
            {score(aggregate?.metrics.final_score?.value)}
            <small>/100</small>
          </strong>
          <span>
            {t("Eligible conversations: {count}", {
              count: aggregate?.metrics.final_score?.sample_count || 0,
            })}
            {output.groups.length > 1 && aggregate
              ? ` · ${groupLabel(aggregate.label, !!output.spec.cohorts)}`
              : ""}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">
            {t("Critical violations")}
            <Icon name="shield" size={18} />
          </span>
          <strong>
            {output.observations.filter((o) => o.final?.critical_flag).length}
          </strong>
          <span>{t("Flagged separately from the score")}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">
            {t("Evaluation coverage")}
            <Icon name="checklist" size={18} />
          </span>
          <strong>
            {output.counts.evaluated}
            <small>/{output.counts.selected}</small>
          </strong>
          <span>
            {t("Awaiting: {pending} · failed: {failed}", {
              pending: output.counts.unevaluated,
              failed: output.counts.failed,
            })}
          </span>
        </div>
      </div>
      <div
        className="analysis-tabs"
        role="tablist"
        aria-label={t("Overview content")}
      >
        <button
          role="tab"
          id={`${tabId}-conversations-tab`}
          aria-controls={`${tabId}-conversations`}
          aria-selected={tab === "conversations"}
          tabIndex={tab === "conversations" ? 0 : -1}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              setTab("analytics");
              document.getElementById(`${tabId}-analytics-tab`)?.focus();
            }
          }}
          onClick={() => setTab("conversations")}
        >
          <Icon name="chat" size={17} />
          {t("Conversations")}
          <span>{output.counts.selected}</span>
        </button>
        <button
          role="tab"
          id={`${tabId}-analytics-tab`}
          aria-controls={`${tabId}-analytics`}
          aria-selected={tab === "analytics"}
          tabIndex={tab === "analytics" ? 0 : -1}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              setTab("conversations");
              document.getElementById(`${tabId}-conversations-tab`)?.focus();
            }
          }}
          onClick={() => setTab("analytics")}
        >
          <Icon name="overview" size={17} />
          {t("Quality analytics")}
        </button>
      </div>
      <div className="analysis-selection">
        <FilterChips output={output} />
      </div>
      <div
        role="tabpanel"
        aria-labelledby={`${tabId}-conversations-tab`}
        id={`${tabId}-conversations`}
        hidden={tab !== "conversations"}
      >
        <section className="panel conversations-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">
                {t("THE CONVERSATION, IN CONTEXT")}
              </span>
              <h2>{t("Conversations behind the numbers")}</h2>
              <p>
                {t(
                  "Open a conversation to explore its assessment and original evidence.",
                )}
              </p>
            </div>
            <span className="panel-icon">
              <Icon name="chat" />
            </span>
          </div>
          <ConversationTable
            output={output}
            sources={sources}
            open={open}
            searchable
          />
          <div className="table-footer">
            <Icon name="shield" size={14} />
            <span>
              {t("Original transcripts · Traceable assessments · Human review")}
            </span>
          </div>
        </section>
      </div>
      <div
        role="tabpanel"
        aria-labelledby={`${tabId}-analytics-tab`}
        id={`${tabId}-analytics`}
        hidden={tab !== "analytics"}
      >
        {aggregate && (
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>
                  {t("Quality at a glance")}
                  {output.groups.length > 1
                    ? ` · ${groupLabel(aggregate.label, !!output.spec.cohorts)}`
                    : ""}
                </h2>
                <p>
                  {t(
                    "Inspect any measure to see its denominator and source conversations.",
                  )}
                </p>
              </div>
              {output.groups.length > 1 ? (
                <label>
                  {t("Measure group")}
                  <select
                    value={aggregate.key}
                    onChange={(e) => setGroupKey(e.target.value)}
                  >
                    {output.groups.map((g) => (
                      <option key={g.key} value={g.key}>
                        {groupLabel(g.label, !!output.spec.cohorts)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <small>{t("Baseline checklist cqa-v1")}</small>
              )}
            </div>
            <div className="metric-grid">
              {Object.entries(aggregate.metrics).map(([metric, value]) => (
                <button
                  className={`metric-tile ${metric === "final_score" ? "primary-metric" : ""}`}
                  key={metric}
                  onClick={() => setInspect({ metric, group: aggregate })}
                >
                  <span>{metricNames[metric] || metric}</span>
                  <strong>
                    {score(value.value)}
                    {value.value != null && <small>%</small>}
                  </strong>
                  <span>
                    {value.sample_count} {t(" eligible · ")}
                    {value.na_count} N/A
                  </span>
                  <span
                    className={`metric-meter ${metric === "critical" ? "critical-meter" : ""}`}
                    aria-hidden="true"
                  >
                    <i style={{ width: `${value.value ?? 0}%` }} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {comparison && (
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>{t("Compare the selection")}</h2>
                <p>
                  {t(
                    "Each bar uses its own eligible denominator. Select a bar to inspect.",
                  )}
                </p>
              </div>
              <label>
                {t("Compare measure")}
                <select
                  value={chartId}
                  onChange={(e) => setChartMetric(e.target.value)}
                >
                  {comparison.spec.metric_ids?.map((id) => (
                    <option key={id} value={id}>
                      {metricNames[id]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {comparison.groups.length ? (
              <div className="bar-chart">
                {comparison.groups.map((group) => {
                  const metric = group.metrics[chartId];
                  return (
                    <button
                      className="bar-row"
                      key={group.key}
                      onClick={() => setInspect({ metric: chartId, group })}
                    >
                      <span>
                        {groupLabel(group.label, !!comparison.spec.cohorts)}
                        <small>
                          {group.counts.selected} {t(" selected ")}
                        </small>
                      </span>
                      <span className="bar-track">
                        <span style={{ width: `${metric?.value || 0}%` }} />
                      </span>
                      <strong>
                        {score(metric?.value)}
                        <small>
                          {t("n=")}
                          {metric?.sample_count || 0}
                        </small>
                      </strong>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Empty>{t("No groups in this selection.")}</Empty>
            )}
          </section>
        )}
      </div>
      {inspect && (
        <Dialog
          title={`${metricNames[inspect.metric]} · ${groupLabel(inspect.group.label, !!output.spec.cohorts)}`}
          close={() => setInspect(null)}
          wide
        >
          <MetricDetails
            {...{ output, sources, checklist, open }}
            metric={inspect.metric}
            group={inspect.group}
          />
        </Dialog>
      )}
    </>
  );
}
function MetricDetails({
  metric,
  group,
  output,
  sources,
  checklist,
  open,
}: Props & { metric: string; group: AnalysisGroup }) {
  const sourceCriterion = checklist?.criteria.find((c) => c.id === metric);
  const criterion =
    sourceCriterion && checklist
      ? criterionDisplay(sourceCriterion, checklist.id)
      : undefined;
  const aggregate = group.metrics[metric as keyof typeof group.metrics];
  return (
    <div className="dialog-body">
      <p>
        {criterion?.description ||
          (metric === "final_score"
            ? t(
                "Mean final quality score across successfully evaluated conversations with a known final score.",
              )
            : t(
                "Percentage of successfully evaluated conversations with a critical violation. This separate flag does not zero the quality score.",
              ))}
      </p>
      {criterion && (
        <p>
          {t("Raw values: ")}
          {criterion.allowed_values.map(raw).join(", ")}
          {t(". Weight:")} {criterion.weight}.{" "}
          {criterion.allow_na
            ? t(
                "N/A when {arg0}. N/A is excluded from the eligible denominator.",
                { arg0: criterion.na_condition || "" },
              )
            : t("N/A is not permitted.")}
        </p>
      )}
      <div className="notice">
        {score(aggregate?.value)}
        {t(" % across ")}
        {aggregate?.sample_count || 0} {t("eligible conversations; ")}
        {aggregate?.na_count || 0} {t(" N/A. Selected:")}{" "}
        {group.counts.selected}
        {t(" ; failed: ")}
        {group.counts.failed}
        {t(" ; unevaluated: ")} {group.counts.unevaluated}.{" "}
        {metric !== "critical" &&
          metric !== "final_score" &&
          t(
            "Criterion percentages normalize the raw score by its maximum before averaging; they are not weighted contributions.",
          )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("Source conversation")}</th>
              <th>{t("Raw value")}</th>
              <th>{t("Eligible")}</th>
              <th>{t("Evidence")}</th>
            </tr>
          </thead>
          <tbody>
            {output.observations
              .filter((o) => group.conversation_ids.includes(o.conversation_id))
              .map((row) => {
                const judgment = row.final?.criteria.find(
                  (c) => c.criterion_id === metric,
                );
                const value =
                  metric === "final_score"
                    ? row.final?.final_score
                    : metric === "critical"
                      ? row.final?.critical_flag
                      : judgment?.value;
                return (
                  <tr key={row.conversation_id}>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => open(row.conversation_id, metric)}
                      >
                        {row.conversation_id}
                      </button>
                    </td>
                    <td>
                      {row.evaluation_status === "ok"
                        ? raw(value)
                        : t(row.evaluation_status)}
                    </td>
                    <td>
                      {metric === "final_score"
                        ? value != null
                          ? t("Yes")
                          : t("No")
                        : metric === "critical"
                          ? row.final
                            ? t("Yes")
                            : t("No")
                          : judgment?.applicable
                            ? t("Yes")
                            : t("No")}
                    </td>
                    <td>
                      {judgment?.evidence_turns.map((turn) => (
                        <button
                          key={turn}
                          className="turn-link"
                          onClick={() =>
                            open(row.conversation_id, metric, [turn])
                          }
                        >
                          #{turn}
                        </button>
                      )) || t("Open score explanation")}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <details>
        <summary>{t("Source selection")}</summary>
        <ConversationTable
          output={output}
          sources={sources}
          ids={group.conversation_ids}
          open={open}
        />
      </details>
    </div>
  );
}
