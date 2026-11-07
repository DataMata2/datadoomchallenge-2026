import { useState } from "react";
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
  const aggregate =
    output.groups.find((g) => g.key === groupKey) || output.groups[0];
  const chartId =
    comparison?.spec.metric_ids?.find((id) => id === chartMetric) ||
    comparison?.spec.metric_ids?.[0] ||
    "final_score";
  return (
    <>
      <FilterChips output={output} />
      <div className="stat-strip">
        <div>
          <strong>{output.counts.selected}</strong>
          <span>Selected conversations</span>
        </div>
        <div>
          <strong>{output.counts.evaluated}</strong>
          <span>Evaluated successfully</span>
        </div>
        <div>
          <strong>{output.counts.unevaluated}</strong>
          <span>Awaiting evaluation</span>
        </div>
        <div>
          <strong>{output.counts.failed}</strong>
          <span>Evaluation failed</span>
        </div>
      </div>
      {aggregate && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>
                Quality at a glance
                {output.groups.length > 1 ? ` · ${aggregate.label}` : ""}
              </h2>
              <p>
                Inspect any measure to see its denominator and source
                conversations.
              </p>
            </div>
            {output.groups.length > 1 ? (
              <label>
                Measure group
                <select
                  value={aggregate.key}
                  onChange={(e) => setGroupKey(e.target.value)}
                >
                  {output.groups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <small>Baseline checklist cqa-v1</small>
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
                  {value.sample_count} eligible · {value.na_count} N/A
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
              <h2>Compare the selection</h2>
              <p>
                Each bar uses its own eligible denominator. Select a bar to
                inspect.
              </p>
            </div>
            <label>
              Compare measure
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
                      {group.label}
                      <small>{group.counts.selected} selected</small>
                    </span>
                    <span className="bar-track">
                      <span style={{ width: `${metric?.value || 0}%` }} />
                    </span>
                    <strong>
                      {score(metric?.value)}
                      <small>n={metric?.sample_count || 0}</small>
                    </strong>
                  </button>
                );
              })}
            </div>
          ) : (
            <Empty>No groups in this selection.</Empty>
          )}
        </section>
      )}
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Conversations behind the numbers</h2>
            <p>
              Open a conversation to inspect the original transcript and
              assessment evidence.
            </p>
          </div>
          <small>{output.observations.length} records</small>
        </div>
        <ConversationTable output={output} sources={sources} open={open} />
      </section>
      {inspect && (
        <Dialog
          title={`${metricNames[inspect.metric]} · ${inspect.group.label}`}
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
  const criterion = checklist?.criteria.find((c) => c.id === metric);
  const aggregate = group.metrics[metric as keyof typeof group.metrics];
  return (
    <div className="dialog-body">
      <p>
        {criterion?.description ||
          (metric === "final_score"
            ? "Mean final quality score across successfully evaluated conversations with a known final score."
            : "Percentage of successfully evaluated conversations with a critical violation. This separate flag does not zero the quality score.")}
      </p>
      {criterion && (
        <p>
          Raw values: {criterion.allowed_values.map(raw).join(", ")}. Weight:{" "}
          {criterion.weight}.{" "}
          {criterion.allow_na
            ? `N/A when ${criterion.na_condition}. N/A is excluded from the eligible denominator.`
            : "N/A is not permitted."}
        </p>
      )}
      <div className="notice">
        {score(aggregate?.value)}% across {aggregate?.sample_count || 0}{" "}
        eligible conversations; {aggregate?.na_count || 0} N/A. Selected:{" "}
        {group.counts.selected}; failed: {group.counts.failed}; unevaluated:{" "}
        {group.counts.unevaluated}.{" "}
        {metric !== "critical" &&
          metric !== "final_score" &&
          "Criterion percentages normalize the raw score by its maximum before averaging; they are not weighted contributions."}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Source conversation</th>
              <th>Raw value</th>
              <th>Eligible</th>
              <th>Evidence</th>
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
                        : row.evaluation_status}
                    </td>
                    <td>
                      {metric === "final_score"
                        ? value != null
                          ? "Yes"
                          : "No"
                        : metric === "critical"
                          ? row.final
                            ? "Yes"
                            : "No"
                          : judgment?.applicable
                            ? "Yes"
                            : "No"}
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
                      )) || "Open score explanation"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Source selection</summary>
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
