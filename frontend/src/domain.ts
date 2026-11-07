import type { FilterSpec, Run } from "./api";
export const activeRun = (run: Pick<Run, "status" | "finished_at">) =>
  run.status === "queued" ||
  run.status === "running" ||
  (run.status === "cancelled" && !run.finished_at);
export const raw = (value: boolean | number | null | undefined) =>
  value === undefined
    ? "Unknown"
    : value === null
      ? "N/A"
      : typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : String(value);
/** Calendar bounds are Almaty instants: inclusive start, exclusive next-day end. */
export function calendarBounds(
  from: string,
  through: string,
): Pick<FilterSpec, "start_at" | "end_at"> {
  let end_at: string | null = null;
  if (through) {
    const next = new Date(`${through}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    end_at = `${next.toISOString().slice(0, 10)}T00:00:00+05:00`;
  }
  return { start_at: from ? `${from}T00:00:00+05:00` : null, end_at };
}
