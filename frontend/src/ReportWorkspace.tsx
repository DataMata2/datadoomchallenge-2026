import { groupLabel, message, t } from "./i18n";
import { useEffect, useState } from "react";
import {
  api,
  type Checklist,
  type ConversationResponse,
  type CustomMetricDefinition,
  type Report,
  type ReportMetric,
  type Run,
  type SavedObservation,
} from "./api";
import Analysis from "./Analysis";
import Icon from "./Icon";
import {
  activeRun,
  Dialog,
  Empty,
  ErrorBox,
  errorText,
  raw,
  RunProgress,
  score,
  time,
} from "./ui";
type Props = {
  reports: Report[];
  sourceRevision?: number;
  selectedId: string;
  select: (id: string) => void;
  reloadLists: () => Promise<void>;
  checklist?: Checklist;
  open: (
    id: string,
    dataset: string,
    metric?: string,
    turns?: number[],
    saved?: SavedObservation,
  ) => void;
};
export default function ReportWorkspace({
  reports,
  sourceRevision = 0,
  selectedId,
  select,
  reloadLists,
  checklist,
  open,
}: Props) {
  const [report, setReport] = useState<Report>();
  const [sources, setSources] = useState<ConversationResponse[]>([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [metricForm, setMetricForm] = useState(false);
  const [metricDetail, setMetricDetail] = useState<string>();
  const [run, setRun] = useState<Run>();
  useEffect(() => {
    setMetricDetail(undefined);
    setMetricForm(false);
    setRun(undefined);
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId) {
      setReport(undefined);
      setSources([]);
      return;
    }
    let alive = true;
    if (report?.id !== selectedId) {
      setReport(undefined);
      setLoading(true);
    }
    setError("");
    api
      .report(selectedId)
      .then(async (r) => {
        const savedIds = new Set(r.output?.conversation_ids || []);
        const selection =
          r.spec && savedIds.size
            ? await api.search({
                dataset_id: r.spec.filters?.dataset_id || "DEV",
              })
            : { items: [] };
        if (alive) {
          setReport(r);
          setSources(
            selection.items.filter((source) =>
              savedIds.has(source.conversation_id),
            ),
          );
        }
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId, revision, sourceRevision]);
  useEffect(() => {
    const pending = report?.custom_metrics.some((m) => m.runs.some(activeRun));
    if (!pending && (!run || !activeRun(run))) return;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        if (run && activeRun(run)) {
          const next = await api.run(run.id);
          if (alive) setRun(next);
        }
        if (alive) setRevision((v) => v + 1);
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    }, 1800);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [report, run]);
  const reload = async () => {
    setRevision((v) => v + 1);
    await reloadLists();
  };
  const send = async () => {
    setSending(true);
    setError("");
    try {
      const response = await api.assistant(content, selectedId || undefined);
      select(response.report_id);
      if (response.metric_run_id) setRun(await api.run(response.metric_run_id));
      setContent("");
      setRevision((v) => v + 1);
      await reloadLists();
      if (response.status === "error")
        setError(response.error || response.message.content);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  };
  const currentMetric = report?.custom_metrics.find(
    (m) => m.definition.id === metricDetail,
  );
  return (
    <>
      <div className="report-toolbar">
        <label className="grow">
          {t("Saved report")}
          <select value={selectedId} onChange={(e) => select(e.target.value)}>
            <option value="">{t("New assistant conversation")}</option>
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                {t(r.title)} ({t(r.status || "")})
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            select("");
            setError("");
          }}
        >
          {t("New conversation")}
        </button>
        {report?.status === "ready" && (
          <button
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              setError("");
              try {
                setReport(await api.refreshReport(report.id));
                await reload();
              } catch (e) {
                setError(errorText(e));
              } finally {
                setRefreshing(false);
              }
            }}
          >
            {refreshing ? t("Refreshing…") : t("Refresh saved analysis")}
          </button>
        )}
      </div>
      {error && (
        <ErrorBox>
          {message(error)}{" "}
          <button onClick={() => setRevision((v) => v + 1)}>
            {t("Retry report")}
          </button>
        </ErrorBox>
      )}
      <div className="report-workspace">
        <aside className="assistant-pane">
          <div className="section-head">
            <div>
              <span className="assistant-orbit">
                <Icon name="sparkle" size={25} />
              </span>
              <h2>{t("Analysis assistant")}</h2>
              <p>
                {t(
                  "Ask a question, refine the selection or define an independent metric.",
                )}
              </p>
            </div>
          </div>
          <div className="message-history" aria-live="polite">
            {report?.messages.length ? (
              report.messages.map((m) => (
                <article key={m.id} className={`message ${m.role}`}>
                  <strong>
                    {m.role === "user" ? t("You") : t("CQA assistant")}
                  </strong>
                  <p translate="no">{m.content}</p>
                  <time>{time(m.created_at)}</time>
                </article>
              ))
            ) : (
              <Empty>
                {t(
                  "Start with a concrete period and question. For example: “Compare day and night quality for agent chats in October 2026.”",
                )}
              </Empty>
            )}
            {sending && (
              <div className="message assistant" role="status">
                {t("Interpreting your question and preparing the analysis…")}
              </div>
            )}
          </div>
          <form
            className="assistant-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="assistant-message">{t("Your question")}</label>
            <div className="prompt-suggestions">
              <button
                type="button"
                disabled={sending}
                onClick={() =>
                  setContent(
                    t(
                      "For DEV agent chats in October 2026, compare quality by language.",
                    ),
                  )
                }
              >
                {t("Compare languages")}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() =>
                  setContent(
                    t(
                      "For DEV in October 2026, show conversations with critical violations.",
                    ),
                  )
                }
              >
                {t("Explore critical flags")}
              </button>
            </div>
            <textarea
              id="assistant-message"
              required
              maxLength={8000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t(
                "Compare October 2026 agent chats by day and night…",
              )}
            />
            <button className="primary" disabled={sending || !content.trim()}>
              {sending ? t("Preparing response…") : t("Send question")}
            </button>
            <small>
              {t(
                "The assistant can request clarification. Custom assessment requests start model work; filters alone do not reevaluate conversations.",
              )}
            </small>
          </form>
        </aside>
        <div className="report-canvas">
          {loading ? (
            <Empty>{t("Opening the saved report…")}</Empty>
          ) : !report ? (
            <Empty>
              {t(
                "Your report will appear here with its interpreted filters, denominators and sources. You can also save the current overview selection as a report.",
              )}
            </Empty>
          ) : (
            <>
              <div className="section-head">
                <div>
                  <h2>{t(report.title)}</h2>
                  <p>
                    {t("Saved ")}
                    {time(report.updated_at)} · {t(report.status || "")}
                  </p>
                </div>
                {report.status === "ready" && (
                  <button onClick={() => setMetricForm(true)}>
                    {t("Define custom metric")}
                  </button>
                )}
              </div>
              {report.stale && (
                <div className="notice">
                  {t(
                    "Source assessments have changed since this report was saved. Refresh the saved analysis to update its numbers; custom results remain in history.",
                  )}
                </div>
              )}
              {report.output ? (
                <Analysis
                  saved
                  output={report.output}
                  comparison={
                    report.output.spec.group_by !== "none" ||
                    report.output.spec.cohorts
                      ? report.output
                      : undefined
                  }
                  sources={sources}
                  checklist={checklist}
                  open={(id, metric, turns, saved) =>
                    open(
                      id,
                      report.spec?.filters?.dataset_id || "DEV",
                      metric,
                      turns,
                      saved,
                    )
                  }
                />
              ) : (
                <Empty>
                  {t(
                    "This report is a draft. Answer the assistant’s clarification to produce an analysis.",
                  )}
                </Empty>
              )}
              {run && (
                <RunProgress
                  run={run}
                  cancel={async () => {
                    try {
                      setRun(await api.cancelRun(run.id));
                      await reload();
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                />
              )}
              <section className="panel">
                <div className="section-head">
                  <div>
                    <h2>{t("Independent custom metrics")}</h2>
                    <p>
                      {t(
                        "Custom metrics have their own evidence and coverage. They never change the regular quality score.",
                      )}
                    </p>
                  </div>
                </div>
                {report.custom_metrics.length ? (
                  <div className="custom-metric-list">
                    {report.custom_metrics.map((m) => (
                      <button
                        className="custom-metric"
                        key={m.definition.id}
                        onClick={() => setMetricDetail(m.definition.id)}
                      >
                        <span>
                          <strong>{m.definition.title}</strong>
                          <small>
                            {t(m.status)} ·{" "}
                            {m.definition.answer_type === "boolean"
                              ? t("Yes percentage")
                              : t("Raw-scale mean")}
                          </small>
                        </span>
                        <strong>
                          {score(m.aggregate.value)}
                          {m.aggregate.value != null &&
                          m.aggregate.unit === "percent_true"
                            ? "%"
                            : ""}
                        </strong>
                        <small>
                          {t(
                            "{applicable} applicable / {selected} selected · {pending} pending · {uncovered} uncovered",
                            {
                              applicable: m.aggregate.sample_count,
                              selected: m.aggregate.selected_count,
                              pending: m.aggregate.pending_count,
                              uncovered: m.aggregate.uncovered_count,
                            },
                          )}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty>
                    {t(
                      "No custom metric has been assessed for this report. Define a metric or ask the assistant for one.",
                    )}
                  </Empty>
                )}
              </section>
            </>
          )}
        </div>
      </div>
      {metricForm && report && (
        <MetricForm
          close={() => setMetricForm(false)}
          start={async (definition) => {
            const next = await api.startMetric(report.id, definition);
            setRun(next);
            setMetricForm(false);
            await reload();
          }}
        />
      )}
      {currentMetric && report && (
        <MetricDialog
          metric={currentMetric}
          dataset={report.spec?.filters?.dataset_id || "DEV"}
          close={() => setMetricDetail(undefined)}
          open={open}
          rerun={async () => {
            const next = await api.rerunMetric(
              report.id,
              currentMetric.definition.id,
            );
            setRun(next);
            await reload();
          }}
          cancel={async (id) => {
            await api.cancelRun(id);
            await reload();
          }}
        />
      )}
    </>
  );
}
function MetricForm({
  close,
  start,
}: {
  close: () => void;
  start: (definition: CustomMetricDefinition) => Promise<void>;
}) {
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"boolean" | "scale">("boolean");
  const [values, setValues] = useState("0, 1, 2");
  const [allowNa, setAllowNa] = useState(false);
  const [na, setNa] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={t("Define an independent metric")} close={close}>
      <form
        className="dialog-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const allowed =
              kind === "boolean"
                ? [false, true]
                : values.split(",").map((v) => {
                    if (!v.trim() || !Number.isFinite(Number(v)))
                      throw new Error(
                        "Enter finite numeric raw steps separated by commas.",
                      );
                    return Number(v);
                  });
            await start({
              id,
              title,
              description,
              answer_type: kind,
              allowed_values: allowed,
              allow_na: allowNa,
              na_condition: allowNa ? na : null,
            });
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          {t(
            "Describe one observable property of a conversation. This starts a separate assessment of the report’s current selection.",
          )}
        </p>
        <label>
          {t("Metric ID")}
          <input
            required
            pattern="[a-z][a-z0-9_-]{0,63}"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="client_led_contact"
          />
        </label>
        <label>
          {t("Title")}
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          {t("Definition and judgment instructions")}
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          {t("Answer type")}
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="boolean">{t("Boolean (No / Yes)")}</option>
            <option value="scale">{t("Numeric scale")}</option>
          </select>
        </label>
        {kind === "scale" && (
          <label>
            {t("Allowed raw steps")}
            <input
              required
              value={values}
              onChange={(e) => setValues(e.target.value)}
            />
          </label>
        )}
        <label className="inline-label">
          <input
            type="checkbox"
            checked={allowNa}
            onChange={(e) => setAllowNa(e.target.checked)}
          />
          {t("Allow N/A")}
        </label>
        {allowNa && (
          <label>
            {t("N/A condition")}
            <textarea
              required
              value={na}
              onChange={(e) => setNa(e.target.value)}
            />
          </label>
        )}
        <p className="notice">
          {t(
            "Boolean results show the percentage of applicable conversations marked Yes. A No answer is not automatically a negative quality grade. N/A is excluded from the denominator.",
          )}
        </p>
        {error && <ErrorBox>{message(error)}</ErrorBox>}
        <button className="primary" disabled={busy}>
          {busy
            ? t("Starting assessment…")
            : t("Create metric and assess selection")}
        </button>
      </form>
    </Dialog>
  );
}
function MetricDialog({
  metric,
  close,
  open,
  rerun,
  cancel,
  dataset,
}: {
  metric: ReportMetric;
  close: () => void;
  open: Props["open"];
  rerun: () => Promise<void>;
  cancel: (id: string) => Promise<void>;
  dataset: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const a = metric.aggregate;
  const pending = metric.runs.some(activeRun);
  return (
    <Dialog title={metric.definition.title} close={close} wide>
      <div className="dialog-body">
        <p>{metric.definition.description}</p>
        <p>
          {t("Raw domain: ")}
          {metric.definition.allowed_values.map(raw).join(", ")}.{" "}
          {metric.definition.allow_na
            ? t(
                "N/A condition: {arg0}. N/A is excluded from the applicable denominator.",
                { arg0: metric.definition.na_condition },
              )
            : t("N/A is not allowed.")}
        </p>
        <div className="coverage">
          <strong>
            {score(a.value)}
            {a.unit === "percent_true" ? "%" : t(" raw mean")}
          </strong>
          <span>{t("{count} applicable", { count: a.sample_count })}</span>
          <span>{t("{count} assessed", { count: a.assessed_count })}</span>
          <span>{t("{count} selected", { count: a.selected_count })}</span>
          <span>{a.na_count} N/A</span>
          <span>{t("{count} failed", { count: a.failed_count })}</span>
          <span>{t("{count} pending", { count: a.pending_count })}</span>
          <span>{t("{count} cancelled", { count: a.cancelled_count })}</span>
          <span>
            {t("{count} interrupted", { count: a.interrupted_count })}
          </span>
          <span>{t("{count} uncovered", { count: a.uncovered_count })}</span>
          <span>
            {t("{count} outside current selection", {
              count: metric.out_of_scope_count,
            })}
          </span>
        </div>
        {a.uncovered_count > 0 && (
          <p className="notice">
            {t(
              "Some selected conversations have no assessment for this metric. Changing report filters does not automatically assess new sources.",
            )}
          </p>
        )}
        {metric.groups.length > 0 && (
          <div className="bar-chart">
            {metric.groups.map((g) => (
              <div className="row" key={g.key}>
                <strong>{groupLabel(g.label)}</strong>
                <span>
                  {score(g.aggregate.value)}
                  {a.unit === "percent_true" ? "%" : ""} {t(" · n= ")}
                  {g.aggregate.sample_count} · {g.aggregate.na_count} N/A
                </span>
              </div>
            ))}
          </div>
        )}
        <h3>{t("Source judgments")}</h3>
        {metric.results.length ? (
          metric.results.map((result) => (
            <article className="custom-result" key={result.id}>
              <div className="row">
                <button
                  className="text-button"
                  onClick={() =>
                    open(result.conversation_id, result.dataset_id)
                  }
                >
                  {result.conversation_id}
                </button>
                <strong>
                  {result.status === "ok"
                    ? raw(result.judgment?.value)
                    : t("Failed")}
                </strong>
              </div>
              {result.judgment ? (
                <>
                  <p translate="no">{result.judgment.rationale}</p>
                  <div className="row">
                    {result.judgment.evidence_turns.map((turn) => (
                      <button
                        className="turn-link"
                        key={turn}
                        onClick={() =>
                          open(
                            result.conversation_id,
                            result.dataset_id,
                            undefined,
                            [turn],
                          )
                        }
                      >
                        {t("Source turn #")}
                        {turn}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <ErrorBox>
                  {result.error || t("No valid judgment is available.")}
                </ErrorBox>
              )}
              <small>
                {result.model.name} · {time(result.created_at)}
              </small>
            </article>
          ))
        ) : (
          <Empty>{t("No source judgments are available yet.")}</Empty>
        )}
        <h3>{t("Assessment history")}</h3>
        {metric.runs.map((run) => (
          <RunProgress
            key={run.id}
            run={run}
            cancel={() => {
              void cancel(run.id).catch((e) => setError(errorText(e)));
            }}
          />
        ))}
        <button
          disabled={busy || pending}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await rerun();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t("Starting…") : t("Reassess current report selection")}
        </button>
        <small>
          {t("Dataset ")}
          {dataset}
          {t(". Prior results and runs remain in history.")}
        </small>
        {error && <ErrorBox>{message(error)}</ErrorBox>}
      </div>
    </Dialog>
  );
}
