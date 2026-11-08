import { message, t, formattingLocale, getLocale, count } from "./i18n";
import { activeRun, raw as domainRaw } from "./domain";
import { useEffect, useRef, useId, useState, type ReactNode } from "react";
import Icon from "./Icon";
import LanguageSwitcher from "./LanguageSwitcher";
import type {
  AnalysisOutput,
  ConversationResponse,
  Run,
  ScoredCriterion,
} from "./api";
const metricLabels: Record<string, string> = {
  final_score: "Quality score",
  contact: "Contact",
  discovery: "Discovery",
  identification: "Identification",
  consultation: "Consultation",
  empathy: "Empathy",
  dialogue: "Dialogue",
  closure: "Closure",
  critical: "Critical violation",
};
export const metricNames: Record<string, string> = new Proxy(metricLabels, {
  get: (target, key) =>
    typeof key === "string" && key in target ? t(target[key]) : undefined,
});
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
  value == null ? t("Unknown") : value.toFixed(2);
export { activeRun } from "./domain";
export const raw = (value: Parameters<typeof domainRaw>[0]) =>
  t(domainRaw(value));
export const time = (value: string | null | undefined) => {
  if (!value) return t("No assigned date");
  const options: Intl.DateTimeFormatOptions =
    getLocale() === "en"
      ? { dateStyle: "medium", timeStyle: "short" }
      : {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        };
  return new Intl.DateTimeFormat(formattingLocale(), {
    ...options,
    timeZone: "Asia/Almaty",
  }).format(new Date(value));
};
export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";
export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="error" role="alert">
      {typeof children === "string" ? message(children) : children}
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
        <div className="dialog-actions">
          <LanguageSwitcher />
          <button
            className="icon"
            disabled={busy}
            onClick={close}
            aria-label={t("Close dialog")}
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      {children}
    </dialog>
  );
}
export function FilterChips({ output }: { output: AnalysisOutput }) {
  const filters = output.spec.filters;
  const chips: string[] = [];
  if (filters?.start_at)
    chips.push(t("From {arg0}", { arg0: time(filters.start_at) }));
  if (filters?.end_at)
    chips.push(t("Before {arg0}", { arg0: time(filters.end_at) }));
  if (filters?.channel) chips.push(t(filters.channel));
  if (filters?.language) chips.push(filters.language);
  if (filters?.hours)
    chips.push(
      t("Hours {arg0}:00–{arg1}:00 (end exclusive)", {
        arg0: filters.hours.start,
        arg1: filters.hours.end,
      }),
    );
  if (filters?.weekdays)
    chips.push(t("ISO weekdays {arg0}", { arg0: filters.weekdays.join(", ") }));
  if (filters?.holiday != null)
    chips.push(
      filters.holiday
        ? t("KZ public holidays")
        : t("Exclude KZ public holidays"),
    );
  if (filters?.min_score != null)
    chips.push(t("Score ≥ {arg0}", { arg0: filters.min_score }));
  if (filters?.max_score != null)
    chips.push(t("Score ≤ {arg0}", { arg0: filters.max_score }));
  if (filters?.critical != null)
    chips.push(
      filters.critical ? t("Critical flagged") : t("No critical flag"),
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
        <summary>{t("How this selection is interpreted")}</summary>
        <ul>
          {output.filter_interpretation.map((text) => (
            <li key={text}>{message(text)}</li>
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
          {run.kind === "evaluation" ? t("Evaluation") : t("Custom metric")}:{" "}
          {t(run.status)}
        </strong>
        <span>
          {run.completed} {t(" complete · ")}
          {run.failed} {t(" failed · ")}
          {run.total} {t(" selected ")}
        </span>
        {activeRun(run) && run.status !== "cancelled" && (
          <button onClick={cancel}>{t("Cancel remaining work")}</button>
        )}
      </div>
      <progress max={run.total || 1} value={run.completed + run.failed} />
      {run.error && <ErrorBox>{message(run.error)}</ErrorBox>}
      <details>
        <summary>{t("Conversation progress")}</summary>
        <ul>
          {run.items.map((item) => (
            <li key={item.conversation_id}>
              {item.conversation_id}: {t(item.status)}
              {item.error ? ` — ${message(item.error)}` : ""}
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
        {t(
          "No conversations match this selection. Adjust the filters to broaden it.",
        )}
      </Empty>
    );
  return (
    <>
      {searchable && (
        <div className="table-toolbar">
          <label className="search-input">
            <Icon name="search" size={18} />
            <input
              aria-label={t("Search conversations")}
              placeholder={t("Search by conversation ID…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="table-state">
            <span className="sr-only">{t("Review filter")}</span>
            <select
              aria-label={t("Review filter")}
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="all">{t("All conversations")}</option>
              <option value="critical">{t("Critical flagged")}</option>
              <option value="unevaluated">{t("Awaiting evaluation")}</option>
              <option value="error">{t("Evaluation failed")}</option>
            </select>
          </label>
          <span className="table-count">
            {count("conversations", rows.length)}
          </span>
        </div>
      )}
      <div className="table-wrap conversation-table">
        <table>
          <thead>
            <tr>
              <th>{t("Conversation")}</th>
              <th>{t("Demo date")}</th>
              <th>{t("Channel / language")}</th>
              <th>{t("Quality score")}</th>
              <th>{t("Review state")}</th>
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
                          {source.channel === "voice call"
                            ? t("Voice call")
                            : t("Chat")}
                        </span>
                        <span className="language-tag">{source.language}</span>
                      </div>
                    ) : (
                      t("Source loading")
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
                          {t("Evaluated")}
                        </>
                      ) : row.evaluation_status === "error" ? (
                        t("Failed")
                      ) : (
                        t("Awaiting evaluation")
                      )}
                    </span>
                    {row.final?.critical_flag && (
                      <span className="critical">{t("Critical flag")}</span>
                    )}
                    <button
                      className="row-open"
                      aria-label={t("Open {arg0}", {
                        arg0: row.conversation_id,
                      })}
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
            {t(
              "No conversations match your search. Try another ID or review filter.",
            )}
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
