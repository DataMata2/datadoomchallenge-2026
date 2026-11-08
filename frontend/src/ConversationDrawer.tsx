import { useEffect, useRef, useState } from "react";
import {
  api,
  type Appeal,
  type Checklist,
  type ConversationResponse,
  type CriterionDefinition,
  type Evaluation,
  type Run,
  type ScoredCriterion,
  type SavedObservation,
} from "./api";
import {
  activeRun,
  Dialog,
  Empty,
  ErrorBox,
  errorText,
  metricNames,
  raw,
  RunProgress,
  score,
  time,
} from "./ui";
import {
  channelName,
  languageName,
  label,
  metadataText,
  analysisLanguage,
  checklistName,
  criterionDisplay,
} from "./locale";
type Props = {
  id: string;
  dataset: string;
  metric?: string;
  turns?: number[];
  saved?: SavedObservation;
  checklists: Checklist[];
  close: () => void;
  changed: () => void;
};
export default function ConversationDrawer({
  id,
  dataset,
  metric,
  turns,
  saved,
  checklists,
  close,
  changed,
}: Props) {
  const [conversation, setConversation] = useState<ConversationResponse>();
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [version, setVersion] = useState(saved?.checklistVersionId || "cqa-v1");
  const [criterionId, setCriterionId] = useState(metric || "final_score");
  const [highlight, setHighlight] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [original, setOriginal] = useState(false);
  const [run, setRun] = useState<Run>();
  const [runError, setRunError] = useState("");
  const [reload, setReload] = useState(0);
  const [mobilePane, setMobilePane] = useState("assessment");
  const turnRefs = useRef(new Map<number, HTMLLIElement>());
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setEvaluation(null);
    api
      .conversation(dataset, id, version)
      .then(async (c) => {
        const e = c.evaluation_id
          ? await api.evaluation(c.evaluation_id)
          : null;
        if (alive) {
          setConversation(c);
          setEvaluation(e);
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
  }, [id, dataset, version, reload]);
  const runStorageKey = `cqa-active-run:${dataset}/${id}`;
  useEffect(() => {
    const savedId = localStorage.getItem(runStorageKey);
    if (!savedId) return;
    let alive = true;
    api
      .run(savedId)
      .then((saved) => {
        if (!alive) return;
        if (
          saved.dataset_id === dataset &&
          saved.conversation_ids.includes(id) &&
          activeRun(saved)
        ) {
          setRun(saved);
          if (saved.checklist_version_id)
            setVersion(saved.checklist_version_id);
        } else localStorage.removeItem(runStorageKey);
      })
      .catch((e) => {
        if (alive) setRunError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [runStorageKey]);
  useEffect(() => {
    if (!run) return;
    if (activeRun(run)) localStorage.setItem(runStorageKey, run.id);
    else localStorage.removeItem(runStorageKey);
  }, [run, runStorageKey]);
  useEffect(() => {
    if (!run || !activeRun(run)) return;
    let alive = true;
    const timer = setTimeout(() => {
      api
        .run(run.id)
        .then((next) => {
          if (!alive) return;
          setRun(next);
          setRunError("");
          if (!activeRun(next)) {
            setReload((v) => v + 1);
            changed();
          }
        })
        .catch((e) => {
          if (alive) setRunError(errorText(e));
        });
    }, 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [run, runError]);
  const savedCriterion = saved?.observation.final?.criteria.find(
    (c) => c.criterion_id === criterionId,
  );
  const differs =
    saved &&
    (saved.observation.evaluation_id !== (evaluation?.id ?? null) ||
      saved.observation.evaluation_status !==
        (evaluation?.status ?? "unevaluated") ||
      JSON.stringify(saved.observation.final) !==
        JSON.stringify(evaluation?.final ?? null));
  const current = original ? evaluation?.original : evaluation?.final;
  const criterionTitle = (id: string) =>
    evaluation?.checklist_version_id === "cqa-v1"
      ? metricNames[id] || id
      : evaluation?.checklist_snapshot.criteria.find(
          (criterion) => criterion.id === id,
        )?.title || id;
  const selected = current?.criteria.find(
    (c) => c.criterion_id === criterionId,
  );
  const storedDefinition = evaluation?.checklist_snapshot.criteria.find(
    (c) => c.id === criterionId,
  );
  const definition =
    storedDefinition && evaluation
      ? criterionDisplay(storedDefinition, evaluation.checklist_version_id)
      : undefined;
  const jump = (turns: number[], reveal = true) => {
    if (reveal) setMobilePane("transcript");
    setHighlight(turns);
    requestAnimationFrame(() =>
      turnRefs.current
        .get(turns[0])
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };
  useEffect(() => {
    if (selected) setHighlight(selected.evidence_turns);
  }, [selected]);
  useEffect(() => {
    if (conversation && turns?.length) jump(turns);
  }, [conversation, turns]);
  const refresh = () => {
    setReload((v) => v + 1);
    changed();
  };
  const evaluate = async () => {
    setBusy(true);
    setError("");
    try {
      setRun(
        await api.startRun({
          dataset_id: dataset,
          conversation_ids: [id],
          checklist_version_id: version,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Диалог ${id}`} close={close} wide>
      <div className="conversation-meta">
        <span>{dataset}</span>
        <span>{channelName(conversation?.channel)}</span>
        <span>{languageName(conversation?.language)}</span>
        <span>{time(conversation?.demo_started_at)}</span>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading ? (
        <Empty>Загрузка исходного диалога и оценки…</Empty>
      ) : (
        conversation && (
          <>
            <div
              className="mobile-review-tabs"
              role="group"
              aria-label="Панель диалога"
            >
              <button
                aria-pressed={mobilePane === "transcript"}
                onClick={() => setMobilePane("transcript")}
              >
                Расшифровка
              </button>
              <button
                aria-pressed={mobilePane === "assessment"}
                onClick={() => setMobilePane("assessment")}
              >
                Оценка
              </button>
            </div>
            <div className="conversation-layout" data-mobile-pane={mobilePane}>
              <section className="transcript">
                <div className="section-head">
                  <div>
                    <h3>Исходная расшифровка</h3>
                    <p>
                      Реплики всех участников нумеруются с единицы. Исходные
                      временные метки сохранены.
                    </p>
                  </div>
                </div>
                {conversation.audio_url &&
                  /^https?:\/\//i.test(conversation.audio_url) && (
                    <div className="recording">
                      <a
                        href={conversation.audio_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть исходную запись
                      </a>
                      <audio
                        controls
                        preload="none"
                        src={conversation.audio_url}
                      >
                        Воспользуйтесь ссылкой на запись для прослушивания.
                      </audio>
                    </div>
                  )}
                <ol className="turns">
                  {conversation.transcript.map((turn, index) => (
                    <li
                      key={index}
                      ref={(element) => {
                        if (element) turnRefs.current.set(index + 1, element);
                        else turnRefs.current.delete(index + 1);
                      }}
                      className={`${turn.speaker} ${highlight.includes(index + 1) ? "highlight" : ""}`}
                    >
                      <div className="turn-meta">
                        <button onClick={() => setHighlight([index + 1])}>
                          #{index + 1}
                        </button>
                        <strong>{label(turn.speaker)}</strong>
                        <time title={turn.timestamp}>{turn.timestamp}</time>
                      </div>
                      <p>{turn.text}</p>
                    </li>
                  ))}
                </ol>
                <details>
                  <summary>Происхождение временных меток и дат</summary>
                  <p>
                    Исходный временной интервал:{" "}
                    {conversation.observed_span.started_at} до{" "}
                    {conversation.observed_span.ended_at} (
                    {conversation.observed_span.duration_seconds} секунд).
                    Рассчитан по первой и последней реплике расшифровки.
                  </p>
                  <p>
                    {metadataText(conversation.scheduling.interpretation)}{" "}
                    Режим: {label(conversation.scheduling.mode)}; начальное
                    значение: {conversation.scheduling.seed ?? "нет"}; алгоритм:{" "}
                    {label(conversation.scheduling.algorithm)}. Назначение дат
                    не зависит от оценок качества.
                  </p>
                </details>
              </section>
              <section className="assessment">
                {saved && (
                  <section
                    className="notice saved-observation"
                    aria-label="Сохранённая оценка отчёта"
                  >
                    <h3>Сохранённая оценка отчёта</h3>
                    <p>
                      Сформировано:{" "}
                      <time title={saved.generatedAt}>
                        {time(saved.generatedAt)}
                      </time>
                      . Чек-лист: {saved.checklistVersionId}.
                    </p>
                    <p>
                      Оценка: {saved.observation.evaluation_id || "нет"}.
                      Ревизия: {saved.observation.revision || "нет"}. Статус:{" "}
                      {label(saved.observation.evaluation_status)}.
                    </p>
                    <p>
                      Сохранённая оценка качества:{" "}
                      {score(saved.observation.final?.final_score)}. Критическое
                      нарушение: {raw(saved.observation.final?.critical_flag)}.
                    </p>
                    {savedCriterion && (
                      <>
                        <p>
                          {metricNames[criterionId]} сохранённое исходное
                          значение: {raw(savedCriterion.value)}.{" "}
                          {savedCriterion.rationale}
                        </p>
                        <p>
                          Сохранённые доказательства:{" "}
                          {savedCriterion.evidence_turns.map((turn) => (
                            <button
                              className="turn-link"
                              key={turn}
                              onClick={() => jump([turn])}
                            >
                              #{turn}
                            </button>
                          ))}
                        </p>
                      </>
                    )}
                    <p>
                      Сохранённый отчёт меняется только после явного обновления.
                    </p>
                  </section>
                )}
                {saved && (
                  <h3>
                    {differs
                      ? "Текущие значения отличаются от сохранённых в отчёте"
                      : "Текущие значения совпадают с сохранёнными в отчёте"}
                  </h3>
                )}
                <div className="evaluation-controls">
                  <label>
                    Версия чек-листа
                    <select
                      value={version}
                      onChange={(e) => {
                        setVersion(e.target.value);
                        setOriginal(false);
                      }}
                    >
                      {checklists.map((c) => (
                        <option key={c.id} value={c.id}>
                          {checklistName(c.id, c.name)} ({c.id})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary"
                    disabled={busy || !!(run && activeRun(run))}
                    onClick={evaluate}
                  >
                    {busy ? "Запуск…" : "Оценить этот диалог"}
                  </button>
                  <small>
                    Запускает оценку моделью по выбранному чек-листу.
                    Существующие результаты сохраняются в истории.
                  </small>
                </div>
                {run && (
                  <RunProgress
                    run={run}
                    cancel={async () => {
                      try {
                        setRun(await api.cancelRun(run.id));
                      } catch (e) {
                        setRunError(errorText(e));
                      }
                    }}
                  />
                )}
                {runError && (
                  <ErrorBox>
                    {runError}{" "}
                    <button onClick={() => setRunError("")}>
                      Повторить загрузку хода оценки
                    </button>
                  </ErrorBox>
                )}
                {!evaluation ? (
                  <Empty>
                    Для этой версии чек-листа ещё нет оценки. Запустите оценку
                    диалога.
                  </Empty>
                ) : evaluation.status === "error" ? (
                  <ErrorBox>
                    Ошибка оценки: {evaluation.error}. Оценка качества
                    недоступна.
                  </ErrorBox>
                ) : (
                  <>
                    <div className="score-summary">
                      <strong>
                        {score(current?.final_score)}
                        <small>/100</small>
                      </strong>
                      <div>
                        <span>
                          {current?.critical_flag
                            ? "Обнаружено критическое нарушение"
                            : "Критическое нарушение не обнаружено"}
                        </span>
                        <p>
                          Критическое нарушение учитывается без баллов и не
                          обнуляет итог автоматически.
                        </p>
                      </div>
                    </div>
                    <label className="inline-label">
                      <input
                        type="checkbox"
                        checked={original}
                        onChange={(e) => setOriginal(e.target.checked)}
                      />
                      Показать исходную оценку до проверки
                    </label>
                    <div
                      className="criterion-tabs"
                      role="group"
                      aria-label="Проверить критерий"
                    >
                      <button
                        className={
                          criterionId === "final_score" ? "selected" : ""
                        }
                        onClick={() => setCriterionId("final_score")}
                      >
                        Расчёт оценки
                      </button>
                      {current?.criteria.map((c) => (
                        <button
                          className={
                            criterionId === c.criterion_id ? "selected" : ""
                          }
                          onClick={() => {
                            setCriterionId(c.criterion_id);
                            jump(c.evidence_turns, false);
                          }}
                          key={c.criterion_id}
                        >
                          {criterionTitle(c.criterion_id)}
                          <span>{raw(c.value)}</span>
                        </button>
                      ))}
                    </div>
                    {criterionId === "final_score" ? (
                      <div className="criterion-detail">
                        <h3>Как рассчитывается оценка</h3>
                        <p>
                          Набрано баллов {score(current?.earned_points)} ÷
                          применимый вес {score(current?.applicable_weight)} ×
                          100 = <strong>{score(current?.final_score)}</strong>.
                        </p>
                        <p>
                          Неприменимые критерии не дают баллов и исключаются из
                          применимого веса. Итог нормируется по применимому весу
                          и округляется до двух знаков.
                        </p>
                        <table>
                          <thead>
                            <tr>
                              <th>Критерий</th>
                              <th>Исходное</th>
                              <th>Баллы</th>
                              <th>Вклад /100</th>
                            </tr>
                          </thead>
                          <tbody>
                            {current?.criteria.map((c) => (
                              <tr key={c.criterion_id}>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      setCriterionId(c.criterion_id);
                                      jump(c.evidence_turns, false);
                                    }}
                                  >
                                    {criterionTitle(c.criterion_id)}
                                  </button>
                                </td>
                                <td>{raw(c.value)}</td>
                                <td>
                                  {c.points == null ? "Н/П" : score(c.points)}
                                </td>
                                <td>
                                  {c.weighted_score == null
                                    ? "Без баллов"
                                    : score(c.weighted_score)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      selected &&
                      definition && (
                        <CriterionDetail
                          criterion={selected}
                          definition={definition}
                          evaluation={evaluation}
                          jump={jump}
                          refresh={refresh}
                          original={original}
                        />
                      )
                    )}
                    <details className="assessment-identity">
                      <summary>Происхождение оценки</summary>
                      <p>
                        Чек-лист: {evaluation.checklist_version_id}
                        <br />
                        Модель: {evaluation.model.name} (
                        {label(evaluation.model.mode)})
                        <br />
                        Язык анализа:{" "}
                        {analysisLanguage(evaluation.analysis_language)}
                        <br />
                        Версия запроса модели: {evaluation.prompt_version}
                        <br />
                        Создано: {time(evaluation.created_at)}
                        <br />
                        Оценка: {evaluation.id}
                      </p>
                    </details>
                  </>
                )}
              </section>
            </div>
          </>
        )
      )}
    </Dialog>
  );
}
function CriterionDetail({
  criterion,
  definition,
  evaluation,
  jump,
  refresh,
  original,
}: {
  criterion: ScoredCriterion;
  definition: CriterionDefinition;
  evaluation: Evaluation;
  jump: (turns: number[]) => void;
  refresh: () => void;
  original: boolean;
}) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const appeals = evaluation.appeals.filter(
    (a) => a.criterion_id === criterion.criterion_id,
  );
  useEffect(() => {
    setComment("");
    setError("");
  }, [criterion.criterion_id]);
  return (
    <div className="criterion-detail">
      <h3>{definition.title}</h3>
      <p>{definition.description}</p>
      <dl className="score-facts">
        <div>
          <dt>Исходное значение</dt>
          <dd>{raw(criterion.value)}</dd>
        </div>
        <div>
          <dt>Максимум</dt>
          <dd>
            {definition.answer_type === "boolean"
              ? "Да"
              : Math.max(
                  ...(definition.allowed_values.filter(
                    (v) => typeof v === "number",
                  ) as number[]),
                )}
          </dd>
        </div>
        <div>
          <dt>Вес</dt>
          <dd>{definition.weight}</dd>
        </div>
        <div>
          <dt>Взвешенный вклад</dt>
          <dd>
            {criterion.weighted_score == null
              ? "Без баллов / Н/П"
              : `${score(criterion.weighted_score)} /100`}
          </dd>
        </div>
      </dl>
      <p>
        {criterion.applicable
          ? "Применимо к этому диалогу."
          : "Неприменимо; исключено из знаменателя оценки."}{" "}
        {definition.allow_na
          ? `Условие Н/П: ${definition.na_condition}`
          : "Н/П не допускается."}
      </p>
      {Object.keys(definition.scale_meanings || {}).length > 0 && (
        <details>
          <summary>Шкала оценки</summary>
          <ul>
            {Object.entries(definition.scale_meanings || {}).map(
              ([value, meaning]) => (
                <li key={value}>
                  <strong>
                    {value === "true"
                      ? "Да"
                      : value === "false"
                        ? "Нет"
                        : value}
                  </strong>
                  : {meaning}
                </li>
              ),
            )}
          </ul>
        </details>
      )}
      <blockquote>{criterion.rationale}</blockquote>
      <div className="row">
        <strong>Исходные доказательства</strong>
        {criterion.evidence_turns.map((turn) => (
          <button className="turn-link" key={turn} onClick={() => jump([turn])}>
            Реплика №{turn}
          </button>
        ))}
        <button
          className="text-button"
          onClick={() => jump(criterion.evidence_turns)}
        >
          Выделить все доказательства
        </button>
      </div>
      <h4>История апелляций и проверок</h4>
      {appeals.length ? (
        appeals.map((a) => (
          <AppealCard
            key={a.id}
            appeal={a}
            definition={definition}
            refresh={refresh}
          />
        ))
      ) : (
        <p className="muted">Для этого критерия нет апелляций.</p>
      )}
      {original && (
        <p className="notice">
          Вы просматриваете исходную оценку. Новая апелляция относится к
          текущему итоговому значению.
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api.appeal({
              evaluation_id: evaluation.id,
              criterion_id: criterion.criterion_id,
              comment,
            });
            setComment("");
            refresh();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Причина апелляции
          <textarea
            required
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Объясните, почему вы оспариваете оценку, и укажите исходные реплики."
          />
        </label>
        <button disabled={busy || !comment.trim()}>
          {busy ? "Сохранение…" : "Подать апелляцию"}
        </button>
      </form>
      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}
function AppealCard({
  appeal,
  definition,
  refresh,
}: {
  appeal: Appeal;
  definition: CriterionDefinition;
  refresh: () => void;
}) {
  const [action, setAction] = useState<"confirm" | "change">("confirm");
  const [value, setValue] = useState(
    JSON.stringify(definition.allowed_values[0]),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <article className="appeal">
      <div className="row">
        <strong>{label(appeal.status)}</strong>
        <time>{time(appeal.created_at)}</time>
      </div>
      <p>{appeal.comment}</p>
      {appeal.decision ? (
        <div className="decision">
          <strong>
            {appeal.decision.action === "change"
              ? `Изменено на ${raw(appeal.decision.value)}`
              : `Подтверждено: ${raw(appeal.decision.value)}`}
          </strong>
          <p>{appeal.decision.reason}</p>
          <small>{time(appeal.decision.created_at)}</small>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api.decide(
                appeal.id,
                action === "confirm"
                  ? { action, reason }
                  : {
                      action,
                      reason,
                      value: JSON.parse(value) as boolean | number | null,
                    },
              );
              refresh();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Решение проверяющего
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as typeof action)}
            >
              <option value="confirm">Подтвердить текущее значение</option>
              <option value="change">Изменить значение</option>
            </select>
          </label>
          {action === "change" && (
            <label>
              Проверенное значение
              <select value={value} onChange={(e) => setValue(e.target.value)}>
                {definition.allowed_values.map((v) => (
                  <option key={JSON.stringify(v)} value={JSON.stringify(v)}>
                    {raw(v)}
                  </option>
                ))}
                {definition.allow_na && <option value="null">Н/П</option>}
              </select>
            </label>
          )}
          <label>
            Обоснование решения
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={busy || !reason.trim()}>
            {busy ? "Запись…" : "Записать решение проверяющего"}
          </button>
        </form>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
    </article>
  );
}
