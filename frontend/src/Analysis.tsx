import { useId, useState } from "react";
import Icon from "./Icon";
import { groupLabel, label, criterionDisplay } from "./locale";
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
  const [tab, setTab] = useState(saved ? "analytics" : "conversations");
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
            Выбрано диалогов
            <Icon name="chat" size={18} />
          </span>
          <strong>{output.counts.selected}</strong>
          <span>В текущей выборке</span>
        </div>
        <div className="stat-card featured">
          <span className="stat-label">
            Средняя оценка качества
            <Icon name="sparkle" size={18} />
          </span>
          <strong>
            {score(aggregate?.metrics.final_score?.value)}
            <small>/100</small>
          </strong>
          <span>
            {aggregate?.metrics.final_score?.sample_count || 0} учтённых
            диалогов
            {output.groups.length > 1 && aggregate
              ? ` · ${groupLabel(aggregate.label, !!output.spec.cohorts)}`
              : ""}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">
            Критические нарушения
            <Icon name="shield" size={18} />
          </span>
          <strong>
            {output.observations.filter((o) => o.final?.critical_flag).length}
          </strong>
          <span>Учитываются отдельно от оценки</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">
            Охват оценкой
            <Icon name="checklist" size={18} />
          </span>
          <strong>
            {output.counts.evaluated}
            <small>/{output.counts.selected}</small>
          </strong>
          <span>
            {output.counts.unevaluated} ожидают · {output.counts.failed} с
            ошибкой
          </span>
        </div>
      </div>
      <div
        className="analysis-tabs"
        role="tablist"
        aria-label="Содержимое обзора"
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
          Диалоги<span>{output.counts.selected}</span>
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
          Аналитика качества
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
              <span className="eyebrow">ДИАЛОГ В КОНТЕКСТЕ</span>
              <h2>Диалоги за показателями</h2>
              <p>
                Откройте диалог, чтобы изучить оценку и исходные доказательства.
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
              Исходные расшифровки · Проверяемые оценки · Проверка человеком
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
                  Ключевые показатели качества
                  {output.groups.length > 1
                    ? ` · ${groupLabel(aggregate.label, !!output.spec.cohorts)}`
                    : ""}
                </h2>
                <p>
                  Откройте показатель, чтобы увидеть его знаменатель и исходные
                  диалоги.
                </p>
              </div>
              {output.groups.length > 1 ? (
                <label>
                  Группа показателей
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
                <small>Базовый чек-лист cqa-v1</small>
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
                    {value.sample_count} учтено · {value.na_count} Н/П
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
                <h2>Сравнение выборки</h2>
                <p>
                  Каждый столбец использует свой знаменатель. Выберите столбец
                  для проверки.
                </p>
              </div>
              <label>
                Показатель для сравнения
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
                        <small>{group.counts.selected} выбрано</small>
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
              <Empty>В этой выборке нет групп.</Empty>
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
            ? "Средняя итоговая оценка качества по успешно оценённым диалогам с известным итоговым баллом."
            : "Доля успешно оценённых диалогов с критическим нарушением. Этот отдельный признак не обнуляет оценку качества.")}
      </p>
      {criterion && (
        <p>
          Исходные значения: {criterion.allowed_values.map(raw).join(", ")}.
          Вес: {criterion.weight}.{" "}
          {criterion.allow_na
            ? `Н/П, если: ${criterion.na_condition}. Н/П исключается из знаменателя.`
            : "Н/П не допускается."}
        </p>
      )}
      <div className="notice">
        {score(aggregate?.value)}% по {aggregate?.sample_count || 0} учтённым
        диалогам; {aggregate?.na_count || 0} Н/П. Выбрано:{" "}
        {group.counts.selected}; с ошибкой: {group.counts.failed}; без оценки:{" "}
        {group.counts.unevaluated}.{" "}
        {metric !== "critical" &&
          metric !== "final_score" &&
          "Проценты критериев рассчитываются относительно максимума исходной шкалы перед усреднением и не являются взвешенным вкладом."}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Исходный диалог</th>
              <th>Исходное значение</th>
              <th>Учтён</th>
              <th>Доказательства</th>
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
                        : label(row.evaluation_status)}
                    </td>
                    <td>
                      {metric === "final_score"
                        ? value != null
                          ? "Да"
                          : "Нет"
                        : metric === "critical"
                          ? row.final
                            ? "Да"
                            : "Нет"
                          : judgment?.applicable
                            ? "Да"
                            : "Нет"}
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
                      )) || "Открыть расчёт оценки"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Исходная выборка</summary>
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
