import { activeRun, raw } from "./domain";
import { useEffect, useRef, useId, useState, type ReactNode } from "react";
import Icon from "./Icon";
import type {
  AnalysisOutput,
  ConversationResponse,
  Run,
  ScoredCriterion,
} from "./api";
export const metricNames: Record<string, string> = {
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
  value == null ? "Unknown" : value.toFixed(2);
export { raw, activeRun } from "./domain";
export const time = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Almaty",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "No assigned date";
export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";
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
          aria-label="Close dialog"
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
  if (filters?.start_at) chips.push(`From ${time(filters.start_at)}`);
  if (filters?.end_at) chips.push(`Before ${time(filters.end_at)}`);
  if (filters?.channel) chips.push(filters.channel);
  if (filters?.language) chips.push(filters.language);
  if (filters?.hours)
    chips.push(
      `Hours ${filters.hours.start}:00–${filters.hours.end}:00 (end exclusive)`,
    );
  if (filters?.weekdays)
    chips.push(`ISO weekdays ${filters.weekdays.join(", ")}`);
  if (filters?.holiday != null)
    chips.push(
      filters.holiday ? "KZ public holidays" : "Exclude KZ public holidays",
    );
  if (filters?.min_score != null) chips.push(`Score ≥ ${filters.min_score}`);
  if (filters?.max_score != null) chips.push(`Score ≤ ${filters.max_score}`);
  if (filters?.critical != null)
    chips.push(filters.critical ? "Critical flagged" : "No critical flag");
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
        <summary>How this selection is interpreted</summary>
        <ul>
          {output.filter_interpretation.map((text) => (
            <li key={text}>{text}</li>
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
          {run.kind === "evaluation" ? "Evaluation" : "Custom metric"}:{" "}
          {run.status}
        </strong>
        <span>
          {run.completed} complete · {run.failed} failed · {run.total} selected
        </span>
        {activeRun(run) && run.status !== "cancelled" && (
          <button onClick={cancel}>Cancel remaining work</button>
        )}
      </div>
      <progress max={run.total || 1} value={run.completed + run.failed} />
      {run.error && <ErrorBox>{run.error}</ErrorBox>}
      <details>
        <summary>Conversation progress</summary>
        <ul>
          {run.items.map((item) => (
            <li key={item.conversation_id}>
              {item.conversation_id}: {item.status}
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
        No conversations match this selection. Adjust the filters to broaden it.
      </Empty>
    );
  return (
    <>
      {searchable && (
        <div className="table-toolbar">
          <label className="search-input">
            <Icon name="search" size={18} />
            <input
              aria-label="Search conversations"
              placeholder="Search by conversation ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="table-state">
            <span className="sr-only">Review filter</span>
            <select
              aria-label="Review filter"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="all">All conversations</option>
              <option value="critical">Critical flagged</option>
              <option value="unevaluated">Awaiting evaluation</option>
              <option value="error">Evaluation failed</option>
            </select>
          </label>
          <span className="table-count">{rows.length} conversations</span>
        </div>
      )}
      <div className="table-wrap conversation-table">
        <table>
          <thead>
            <tr>
              <th>Conversation</th>
              <th>Demo date</th>
              <th>Channel / language</th>
              <th>Quality score</th>
              <th>Review state</th>
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
                            ? "Voice call"
                            : "Chat"}
                        </span>
                        <span className="language-tag">{source.language}</span>
                      </div>
                    ) : (
                      "Source loading"
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
                          Evaluated
                        </>
                      ) : row.evaluation_status === "error" ? (
                        "Failed"
                      ) : (
                        "Awaiting evaluation"
                      )}
                    </span>
                    {row.final?.critical_flag && (
                      <span className="critical">Critical flag</span>
                    )}
                    <button
                      className="row-open"
                      aria-label={`Open ${row.conversation_id}`}
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
            No conversations match your search. Try another ID or review filter.
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
