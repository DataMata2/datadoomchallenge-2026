import { activeRun, raw } from "./domain";
import { useEffect, useRef, useId, useState, type ReactNode } from "react";
import Icon from "./Icon";
import {
  channelName,
  languageName,
  label,
  metadataText,
  analysisLanguage,
} from "./locale";
import type {
  AnalysisOutput,
  ConversationResponse,
  Run,
  ScoredCriterion,
} from "./api";
export const metricNames: Record<string, string> = {
  final_score: "Оценка качества",
  contact: "Контакт",
  discovery: "Выявление запроса",
  identification: "Идентификация",
  consultation: "Консультация",
  empathy: "Эмпатия",
  dialogue: "Ведение диалога",
  closure: "Завершение",
  critical: "Критическое нарушение",
};
export const metricIds = Object.keys(metricNames) as Array<
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
export const score = (value: number | null | undefined) =>
  value == null
    ? "Неизвестно"
    : value.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
export { raw, activeRun } from "./domain";
export const time = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Asia/Almaty",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Дата не назначена";
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Не удалось выполнить запрос.";
export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="error" role="alert">
      {children}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Dialog({
  title,
  close,
  children,
  wide = false,
  busy = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) close();
      }}
    >
      <header className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon"
          disabled={busy}
          onClick={close}
          aria-label="Закрыть диалог"
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function FilterChips({ output }: { output: AnalysisOutput }) {
  const filters = output.spec.filters;
  const chips: string[] = [];
  if (filters?.start_at) chips.push(`С ${time(filters.start_at)}`);
  if (filters?.end_at) chips.push(`До ${time(filters.end_at)}`);
  if (filters?.channel) chips.push(channelName(filters.channel));
  if (filters?.language) chips.push(languageName(filters.language));
  if (filters?.hours)
    chips.push(
      `Часы ${filters.hours.start}:00–${filters.hours.end}:00 (конец не включается)`,
    );
  if (filters?.weekdays)
    chips.push(`Дни недели ISO: ${filters.weekdays.join(", ")}`);
  if (filters?.holiday != null)
    chips.push(
      filters.holiday
        ? "Праздники Казахстана"
        : "Исключить праздники Казахстана",
    );
  if (filters?.min_score != null)
    chips.push(`Оценка ≥ ${filters.min_score.toLocaleString("ru-RU")}`);
  if (filters?.max_score != null)
    chips.push(`Оценка ≤ ${filters.max_score.toLocaleString("ru-RU")}`);
  if (filters?.critical != null)
    chips.push(
      filters.critical
        ? "С критическим нарушением"
        : "Без критического нарушения",
    );
  return (
    <div className="interpretation">
      <div className="chips">
        <span>{output.spec.filters?.dataset_id || "DEV"}</span>
        <span>Asia/Almaty</span>
        <span>{output.checklist_version_id}</span>
        {chips.map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
      </div>
      <details>
        <summary>Как интерпретируется выборка</summary>
        <ul>
          {output.filter_interpretation.map((text) => (
            <li key={text}>{metadataText(text)}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
export function RunProgress({ run, cancel }: { run: Run; cancel: () => void }) {
  return (
    <section className="run-progress" aria-live="polite">
      <div className="row">
        <strong>
          {run.kind === "evaluation" ? "Оценка" : "Пользовательская метрика"}:{" "}
          {label(run.status)}
        </strong>
        <span>
          {run.completed} завершено · {run.failed} с ошибкой · {run.total}{" "}
          выбрано
        </span>
        {activeRun(run) && run.status !== "cancelled" && (
          <button onClick={cancel}>Отменить оставшуюся работу</button>
        )}
      </div>
      <p>Язык анализа: {analysisLanguage(run.analysis_language)}</p>
      <progress
        aria-label="Ход оценки"
        max={run.total || 1}
        value={run.completed + run.failed}
      />
      {run.error && <ErrorBox>{run.error}</ErrorBox>}
      <details>
        <summary>Ход оценки диалогов</summary>
        <ul>
          {run.items.map((item) => (
            <li key={item.conversation_id}>
              {item.conversation_id}: {label(item.status)}
              {item.error ? ` — ${item.error}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
export function ConversationTable({
  output,
  sources,
  open,
  ids,
  searchable = false,
}: {
  output: AnalysisOutput;
  sources: ConversationResponse[];
  open: (id: string, metric?: string) => void;
  ids?: string[];
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const rows = output.observations.filter(
    (row) =>
      (!ids || ids.includes(row.conversation_id)) &&
      (!searchable ||
        (row.conversation_id
          .toLowerCase()
          .includes(query.toLowerCase().trim()) &&
          (state === "all" ||
            (state === "critical"
              ? row.final?.critical_flag
              : state === "unevaluated"
                ? row.evaluation_status === "unevaluated"
                : row.evaluation_status === "error")))),
  );
  if (!rows.length && !searchable)
    return (
      <Empty>
        В этой выборке нет диалогов. Измените фильтры, чтобы расширить её.
      </Empty>
    );
  return (
    <>
      {searchable && (
        <div className="table-toolbar">
          <label className="search-input">
            <Icon name="search" size={18} />
            <input
              aria-label="Поиск диалогов"
              placeholder="Поиск по идентификатору диалога…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="table-state">
            <span className="sr-only">Фильтр проверки</span>
            <select
              aria-label="Фильтр проверки"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="all">Все диалоги</option>
              <option value="critical">С критическим нарушением</option>
              <option value="unevaluated">Ожидает оценки</option>
              <option value="error">Ошибка оценки</option>
            </select>
          </label>
          <span className="table-count">{rows.length} диалогов</span>
        </div>
      )}
      <div className="table-wrap conversation-table">
        <table>
          <thead>
            <tr>
              <th>Диалог</th>
              <th>Демонстрационная дата</th>
              <th>Канал / язык</th>
              <th>Оценка качества</th>
              <th>Статус проверки</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const source = sources.find(
                (s) => s.conversation_id === row.conversation_id,
              );
              return (
                <tr key={row.conversation_id}>
                  <td>
                    <div className="conversation-cell">
                      <span
                        className={`channel-icon ${source?.channel === "voice call" ? "voice" : ""}`}
                      >
                        <Icon
                          name={
                            source?.channel === "voice call" ? "phone" : "chat"
                          }
                          size={17}
                        />
                      </span>
                      <button
                        className="text-button"
                        onClick={() => open(row.conversation_id)}
                      >
                        {row.conversation_id}
                      </button>
                    </div>
                  </td>
                  <td>{time(source?.demo_started_at)}</td>
                  <td>
                    {source ? (
                      <div className="source-tags">
                        <span>
                          {source.channel === "voice call" ? "Звонок" : "Чат"}
                        </span>
                        <span className="language-tag">
                          {languageName(source.language)}
                        </span>
                      </div>
                    ) : (
                      "Загрузка источника"
                    )}
                  </td>
                  <td>
                    <button
                      className={`text-button score score-pill ${row.final?.final_score == null ? "unknown-score" : ""}`}
                      onClick={() => open(row.conversation_id, "final_score")}
                    >
                      {score(row.final?.final_score)}
                    </button>
                  </td>
                  <td>
                    <span className={`status ${row.evaluation_status}`}>
                      {row.evaluation_status === "ok" ? (
                        <>
                          <Icon name="check" size={12} />
                          Оценено
                        </>
                      ) : row.evaluation_status === "error" ? (
                        "Ошибка"
                      ) : (
                        "Ожидает оценки"
                      )}
                    </span>
                    {row.final?.critical_flag && (
                      <span className="critical">Критическое нарушение</span>
                    )}
                    <button
                      className="row-open"
                      aria-label={`Открыть ${row.conversation_id}`}
                      onClick={() => open(row.conversation_id)}
                    >
                      <Icon name="chevron" size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <Empty>
            По вашему запросу нет диалогов. Попробуйте другой идентификатор или
            фильтр проверки.
          </Empty>
        )}
      </div>
    </>
  );
}
export function JudgmentValue({ criterion }: { criterion: ScoredCriterion }) {
  return (
    <span>
      {raw(criterion.value)}
      {criterion.applicable &&
        criterion.normalized_value != null &&
        ` · ${score(criterion.normalized_value * 100)}%`}
    </span>
  );
}
