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
import { label, groupLabel, analysisLanguage } from "./locale";
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
          Сохранённый отчёт
          <select value={selectedId} onChange={(e) => select(e.target.value)}>
            <option value="">Новый диалог с ассистентом</option>
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} ({label(r.status)})
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
          Новый диалог
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
            {refreshing ? "Обновление…" : "Обновить сохранённый анализ"}
          </button>
        )}
      </div>
      {error && (
        <ErrorBox>
          {error}{" "}
          <button onClick={() => setRevision((v) => v + 1)}>
            Повторить загрузку отчёта
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
              <h2>Ассистент аналитика</h2>
              <p>
                Задайте вопрос, уточните выборку или определите независимую
                метрику.
              </p>
            </div>
          </div>
          <div className="message-history" aria-live="polite">
            {report?.messages.length ? (
              report.messages.map((m) => (
                <article key={m.id} className={`message ${m.role}`}>
                  <strong>{m.role === "user" ? "Вы" : "Ассистент CQA"}</strong>
                  <p>{m.content}</p>
                  <time>{time(m.created_at)}</time>
                  {m.role === "assistant" && (
                    <small>
                      Язык анализа: {analysisLanguage(m.analysis_language)}
                    </small>
                  )}
                </article>
              ))
            ) : (
              <Empty>
                Укажите период и вопрос. Например: «Сравни качество чатов днём и
                ночью в октябре 2026 года».
              </Empty>
            )}
            {sending && (
              <div className="message assistant" role="status">
                Уточнение вопроса и подготовка анализа…
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
            <label htmlFor="assistant-message">Ваш вопрос</label>
            <div className="prompt-suggestions">
              <button
                type="button"
                disabled={sending}
                onClick={() =>
                  setContent(
                    "Сравни качество чатов DEV по языкам за октябрь 2026 года.",
                  )
                }
              >
                Сравнить языки
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() =>
                  setContent(
                    "Покажи диалоги DEV с критическими нарушениями за октябрь 2026 года.",
                  )
                }
              >
                Найти критические нарушения
              </button>
            </div>
            <textarea
              id="assistant-message"
              required
              maxLength={8000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Сравни качество чатов днём и ночью за октябрь 2026 года…"
            />
            <button className="primary" disabled={sending || !content.trim()}>
              {sending ? "Подготовка ответа…" : "Отправить вопрос"}
            </button>
            <small>
              Ассистент может задать уточняющий вопрос. Запрос пользовательской
              оценки запускает работу модели; изменение фильтров не
              переоценивает диалоги.
            </small>
          </form>
        </aside>
        <div className="report-canvas">
          {loading ? (
            <Empty>Загрузка сохранённого отчёта…</Empty>
          ) : !report ? (
            <Empty>
              Здесь появится отчёт с расшифровкой фильтров, знаменателями и
              источниками. Текущую выборку обзора также можно сохранить как
              отчёт.
            </Empty>
          ) : (
            <>
              <div className="section-head">
                <div>
                  <h2>{report.title}</h2>
                  <p>
                    Сохранено {time(report.updated_at)} · {label(report.status)}
                  </p>
                </div>
                {report.status === "ready" && (
                  <button onClick={() => setMetricForm(true)}>
                    Задать пользовательскую метрику
                  </button>
                )}
              </div>
              {report.stale && (
                <div className="notice">
                  Исходные оценки изменились после сохранения отчёта. Обновите
                  сохранённый анализ для пересчёта показателей; пользовательские
                  результаты остаются в истории.
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
                  Это черновик отчёта. Ответьте на уточняющий вопрос ассистента,
                  чтобы сформировать анализ.
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
                    <h2>Независимые пользовательские метрики</h2>
                    <p>
                      Пользовательские метрики имеют собственные доказательства
                      и охват. Они не изменяют основную оценку качества.
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
                            {label(m.status)} ·{" "}
                            {m.definition.answer_type === "boolean"
                              ? "Доля ответов «Да»"
                              : "Среднее по исходной шкале"}
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
                          {m.aggregate.sample_count} применимо /{" "}
                          {m.aggregate.selected_count} выбрано ·{" "}
                          {m.aggregate.pending_count} ожидают ·{" "}
                          {m.aggregate.uncovered_count} без оценки
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty>
                    В этом отчёте ещё нет оценённых пользовательских метрик.
                    Задайте метрику или попросите ассистента.
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
          customGroups={!!report.spec?.cohorts}
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
    <Dialog title="Задать независимую метрику" close={close}>
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
                        "Введите конечные числовые значения шкалы через запятую.",
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
          Опишите одно наблюдаемое свойство диалога. Будет запущена отдельная
          оценка текущей выборки отчёта.
        </p>
        <label>
          Идентификатор метрики
          <input
            required
            pattern="[a-z][a-z0-9_-]{0,63}"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="metric_1"
          />
        </label>
        <label>
          Название
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Определение и инструкции по оценке
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Тип ответа
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="boolean">Логический (Нет / Да)</option>
            <option value="scale">Числовая шкала</option>
          </select>
        </label>
        {kind === "scale" && (
          <label>
            Допустимые значения шкалы
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
          Разрешить Н/П
        </label>
        {allowNa && (
          <label>
            Условие Н/П
            <textarea
              required
              value={na}
              onChange={(e) => setNa(e.target.value)}
            />
          </label>
        )}
        <p className="notice">
          Для логического ответа показана доля применимых диалогов с ответом
          «Да». Ответ «Нет» сам по себе не означает плохое качество. Н/П
          исключается из знаменателя.
        </p>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button className="primary" disabled={busy}>
          {busy ? "Запуск оценки…" : "Создать метрику и оценить выборку"}
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
  customGroups,
}: {
  metric: ReportMetric;
  close: () => void;
  open: Props["open"];
  rerun: () => Promise<void>;
  cancel: (id: string) => Promise<void>;
  dataset: string;
  customGroups: boolean;
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
          Исходная шкала: {metric.definition.allowed_values.map(raw).join(", ")}
          .{" "}
          {metric.definition.allow_na
            ? `Условие Н/П: ${metric.definition.na_condition}. Н/П исключается из знаменателя применимых диалогов.`
            : "Н/П не допускается."}
        </p>
        <div className="coverage">
          <strong>
            {score(a.value)}
            {a.unit === "percent_true" ? "%" : " среднее по шкале"}
          </strong>
          <span>{a.sample_count} применимо</span>
          <span>{a.assessed_count} оценено</span>
          <span>{a.selected_count} выбрано</span>
          <span>{a.na_count} Н/П</span>
          <span>{a.failed_count} с ошибкой</span>
          <span>{a.pending_count} ожидают</span>
          <span>{a.cancelled_count} отменено</span>
          <span>{a.interrupted_count} прервано</span>
          <span>{a.uncovered_count} без оценки</span>
          <span>{metric.out_of_scope_count} вне текущей выборки</span>
        </div>
        {a.uncovered_count > 0 && (
          <p className="notice">
            Для части выбранных диалогов эта метрика ещё не оценена. Изменение
            фильтров отчёта не запускает оценку новых источников автоматически.
          </p>
        )}
        {metric.groups.length > 0 && (
          <div className="bar-chart">
            {metric.groups.map((g) => (
              <div className="row" key={g.key}>
                <strong>{groupLabel(g.label, customGroups)}</strong>
                <span>
                  {score(g.aggregate.value)}
                  {a.unit === "percent_true" ? "%" : ""} · n=
                  {g.aggregate.sample_count} · {g.aggregate.na_count} Н/П
                </span>
              </div>
            ))}
          </div>
        )}
        <h3>Оценки исходных диалогов</h3>
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
                    : "Ошибка"}
                </strong>
              </div>
              {result.judgment ? (
                <>
                  <p>{result.judgment.rationale}</p>
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
                        Исходная реплика №{turn}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <ErrorBox>
                  {result.error || "Корректная оценка недоступна."}
                </ErrorBox>
              )}
              <small>
                {result.model.name} · {time(result.created_at)} · Язык анализа:{" "}
                {analysisLanguage(result.analysis_language)}
              </small>
            </article>
          ))
        ) : (
          <Empty>Оценок исходных диалогов пока нет.</Empty>
        )}
        <h3>История оценок</h3>
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
          {busy ? "Запуск…" : "Повторно оценить текущую выборку отчёта"}
        </button>
        <small>
          Набор данных {dataset}. Предыдущие результаты и запуски сохраняются в
          истории.
        </small>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Dialog>
  );
}
