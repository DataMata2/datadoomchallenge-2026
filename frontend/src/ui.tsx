import { activeRun, raw } from "./domain";
import { useEffect, useRef, useId, type ReactNode } from "react";
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
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
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
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon" onClick={close} aria-label="Close dialog">
          ×
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
}: {
  output: AnalysisOutput;
  sources: ConversationResponse[];
  open: (id: string, metric?: string) => void;
  ids?: string[];
}) {
  const rows = output.observations.filter(
    (row) => !ids || ids.includes(row.conversation_id),
  );
  if (!rows.length)
    return (
      <Empty>
        No conversations match this selection. Adjust the filters to broaden it.
      </Empty>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Conversation</th>
            <th>Assigned demo date</th>
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
                  <button
                    className="text-button"
                    onClick={() => open(row.conversation_id)}
                  >
                    {row.conversation_id}
                  </button>
                </td>
                <td>{time(source?.demo_started_at)}</td>
                <td>
                  {source
                    ? `${source.channel} / ${source.language}`
                    : "Source loading"}
                </td>
                <td>
                  <button
                    className="text-button score"
                    onClick={() => open(row.conversation_id, "final_score")}
                  >
                    {score(row.final?.final_score)}
                  </button>
                </td>
                <td>
                  <span className={`status ${row.evaluation_status}`}>
                    {row.evaluation_status}
                  </span>
                  {row.final?.critical_flag && (
                    <span className="critical">Critical flag</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
