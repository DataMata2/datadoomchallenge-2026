import { useEffect, useState } from "react";
import {
  api,
  type AnalysisOutput,
  type AnalysisSpec,
  type Checklist,
  type ConversationResponse,
  type FilterSpec,
  type MetaResponse,
  type Report,
  type UsageSummary,
} from "./api";
import Analysis from "./Analysis";
import { calendarBounds } from "./domain";
import ConversationDrawer from "./ConversationDrawer";
import ChecklistEditor from "./ChecklistEditor";
import ReportWorkspace from "./ReportWorkspace";
import { Empty, ErrorBox, errorText, metricIds } from "./ui";
const groups = [
  "channel",
  "language",
  "month_half",
  "day_night",
  "holiday",
  "date",
] as const;
export default function App() {
  const [view, setView] = useState<"overview" | "reports" | "checklists">(
    "overview",
  );
  const [meta, setMeta] = useState<MetaResponse>();
  const [usage, setUsage] = useState<UsageSummary>();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [filters, setFilters] = useState<FilterSpec>({ dataset_id: "DEV" });
  const [group, setGroup] = useState<(typeof groups)[number]>("channel");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [output, setOutput] = useState<AnalysisOutput>();
  const [comparison, setComparison] = useState<AnalysisOutput>();
  const [sources, setSources] = useState<ConversationResponse[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [bootstrap, setBootstrap] = useState(0);
  const [selected, setSelected] = useState<{
    id: string;
    dataset: string;
    metric?: string;
    turns?: number[];
  }>();
  const [reportId, setReportId] = useState<string>(
    () => localStorage.getItem("cqa-report") || "",
  );
  const reloadLists = async () => {
    const [c, r, u] = await Promise.all([
      api.checklists(),
      api.reports(),
      api.usage(),
    ]);
    setChecklists(c.items);
    setReports(r.items);
    setUsage(u);
  };
  useEffect(() => {
    let alive = true;
    Promise.all([api.meta(), api.checklists(), api.reports(), api.usage()])
      .then(([m, c, r, u]) => {
        if (!alive) return;
        setMeta(m);
        setChecklists(c.items);
        setReports(r.items);
        setUsage(u);
        const dataset =
          m.datasets.find((d) => d.id === "DEV")?.id ||
          m.datasets[0]?.id ||
          "DEV";
        const period = m.available_periods[0];
        if (period) {
          const [y, mo] = period.split("-").map(Number);
          const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
          setStart(`${period}-01`);
          setEnd(`${period}-${last}`);
          setFilters({
            dataset_id: dataset,
            start_at: `${period}-01T00:00:00+05:00`,
            end_at: `${new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10)}T00:00:00+05:00`,
          });
        } else setFilters({ dataset_id: dataset });
      })
      .catch((e) => {
        setError(errorText(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [bootstrap]);
  const spec: AnalysisSpec = {
    title: "Conversation quality overview",
    filters,
    group_by: "none",
    metric_ids: metricIds,
  };
  useEffect(() => {
    if (!meta) return;
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      api.analytics(spec),
      api.analytics({ ...spec, group_by: group }),
      api.search(filters),
    ])
      .then(([o, c, s]) => {
        if (alive) {
          setOutput(o);
          setComparison(c);
          setSources(s.items);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(errorText(e));
          setOutput(undefined);
          setComparison(undefined);
          setSources([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [meta, JSON.stringify(filters), group, revision]);
  const applyDates = () =>
    setFilters({ ...filters, ...calendarBounds(start, end) });
  const open = (
    id: string,
    metric?: string,
    dataset = filters.dataset_id || "DEV",
    turns?: number[],
  ) => setSelected({ id, metric, dataset, turns });
  const savedReport = async () => {
    setError("");
    try {
      const r = await api.saveReport({
        ...spec,
        title: `Quality review · ${start || "all dates"}`,
      });
      await reloadLists();
      setReportId(r.id);
      setView("reports");
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("overview");
          }}
        >
          <span className="brand-mark">cq</span>
          <span>
            Conversation
            <br />
            quality review
          </span>
        </a>
        <nav aria-label="Workspace">
          <button
            className={view === "overview" ? "active" : ""}
            onClick={() => setView("overview")}
          >
            Overview
          </button>
          <button
            className={view === "reports" ? "active" : ""}
            onClick={() => setView("reports")}
          >
            Assistant & reports
          </button>
          <button
            className={view === "checklists" ? "active" : ""}
            onClick={() => setView("checklists")}
          >
            Checklists
          </button>
        </nav>
        <div className="sidebar-foot">
          <strong>Local review workspace</strong>
          <span>Asia/Almaty · KZ holidays</span>
          {usage && (
            <details>
              <summary>Model usage: ${usage.spent_usd.toFixed(2)}</summary>
              <p>
                ${usage.reserved_usd.toFixed(2)} reserved
                <br />${usage.working_remaining_usd.toFixed(2)} working
                allowance left
                <br />${usage.hard_limit_usd} hard limit
              </p>
            </details>
          )}
        </div>
      </aside>
      <main>
        <header className="page-head">
          <div>
            <h1>
              {view === "overview"
                ? "Make every conversation count."
                : view === "reports"
                  ? "From a question to the evidence."
                  : "A clear standard for every review."}
            </h1>
            <p>
              {view === "overview"
                ? "Review quality patterns, then follow the evidence."
                : view === "reports"
                  ? "Keep the analysis, its filters and source conversations together."
                  : "Save a new checklist version and evaluate it explicitly."}
            </p>
          </div>
          <span className="workspace-badge">CQA / review desk</span>
        </header>
        {error && (
          <ErrorBox>
            {error}{" "}
            <button
              onClick={() =>
                meta ? setRevision((v) => v + 1) : setBootstrap((v) => v + 1)
              }
            >
              Retry overview
            </button>
          </ErrorBox>
        )}
        {view === "overview" && (
          <>
            <form
              className="filter-bar"
              onSubmit={(e) => {
                e.preventDefault();
                applyDates();
              }}
            >
              <label>
                Dataset
                <select
                  value={filters.dataset_id}
                  onChange={(e) =>
                    setFilters({ ...filters, dataset_id: e.target.value })
                  }
                >
                  {meta?.datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id} ({d.total_records})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                From
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                Through
                <input
                  type="date"
                  value={end}
                  min={start || undefined}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
              <button type="submit">Apply dates</button>
              <label>
                Channel
                <select
                  value={filters.channel || ""}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      channel: (e.target.value ||
                        null) as FilterSpec["channel"],
                    })
                  }
                >
                  <option value="">All channels</option>
                  {meta?.channels.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Language
                <select
                  value={filters.language || ""}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      language: (e.target.value ||
                        null) as FilterSpec["language"],
                    })
                  }
                >
                  <option value="">All languages</option>
                  {meta?.languages.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Compare by
                <select
                  value={group}
                  onChange={(e) => setGroup(e.target.value as typeof group)}
                >
                  {groups.map((c) => (
                    <option key={c} value={c}>
                      {c.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </form>
            <details className="advanced-filters">
              <summary>Additional calendar and quality filters</summary>
              <div className="filter-bar">
                <label>
                  Local hours
                  <select
                    value={
                      filters.hours
                        ? `${filters.hours.start},${filters.hours.end}`
                        : ""
                    }
                    onChange={(e) => {
                      const values = e.target.value.split(",").map(Number);
                      setFilters({
                        ...filters,
                        hours: e.target.value
                          ? { start: values[0], end: values[1] }
                          : null,
                      });
                    }}
                  >
                    <option value="">All hours</option>
                    <option value="6,18">Day: 06:00–18:00</option>
                    <option value="18,6">Night: 18:00–06:00</option>
                    <option value="12,0">Afternoon/evening: 12:00–24:00</option>
                  </select>
                </label>
                <label>
                  Holiday calendar
                  <select
                    value={
                      filters.holiday == null ? "" : String(filters.holiday)
                    }
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        holiday:
                          e.target.value === ""
                            ? null
                            : e.target.value === "true",
                      })
                    }
                  >
                    <option value="">All dates</option>
                    <option value="true">KZ public holidays (observed)</option>
                    <option value="false">Exclude KZ public holidays</option>
                  </select>
                </label>
                <label>
                  Weekdays
                  <select
                    value={filters.weekdays?.join(",") || ""}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        weekdays: e.target.value
                          ? e.target.value.split(",").map(Number)
                          : null,
                      })
                    }
                  >
                    <option value="">All weekdays</option>
                    <option value="1,2,3,4,5">Monday–Friday</option>
                    <option value="6,7">Saturday–Sunday</option>
                  </select>
                </label>
                <label>
                  Minimum score
                  <input
                    type="number"
                    min="0"
                    max={filters.max_score ?? 100}
                    value={filters.min_score ?? ""}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        min_score:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Maximum score
                  <input
                    type="number"
                    min={filters.min_score ?? 0}
                    max="100"
                    value={filters.max_score ?? ""}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        max_score:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Critical flag
                  <select
                    value={
                      filters.critical == null ? "" : String(filters.critical)
                    }
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        critical:
                          e.target.value === ""
                            ? null
                            : e.target.value === "true",
                      })
                    }
                  >
                    <option value="">Any status</option>
                    <option value="true">Critical flagged</option>
                    <option value="false">No critical flag</option>
                  </select>
                </label>
              </div>
              <small>
                Hours end exclusively. Holidays include observed Kazakhstan
                public holidays; ordinary weekends use the weekday filter.
              </small>
            </details>
            <div className="row provenance">
              <p>
                Assigned demo dates are separate from original timestamps and
                independent of scores.{" "}
                {Array.isArray(meta?.scheduling.algorithms)
                  ? meta.scheduling.algorithms.join(", ")
                  : "No scheduling algorithm"}{" "}
                · seed {String(meta?.scheduling.seed ?? "none")}.
              </p>
              <button disabled={!output || loading} onClick={savedReport}>
                Save selection as report
              </button>
            </div>
            {loading ? (
              <Empty>
                Loading the selected conversations and quality measures…
              </Empty>
            ) : output ? (
              <Analysis
                output={output}
                comparison={comparison}
                sources={sources}
                checklist={checklists.find((c) => c.id === "cqa-v1")}
                open={(id, metric, turns) =>
                  open(id, metric, filters.dataset_id, turns)
                }
              />
            ) : (
              <Empty>
                Import a local dataset to begin. See the setup guide for the
                import command.
              </Empty>
            )}
          </>
        )}
        {view === "reports" && (
          <ReportWorkspace
            reports={reports}
            sourceRevision={revision}
            selectedId={reportId}
            select={(id) => {
              setReportId(id);
              localStorage.setItem("cqa-report", id);
            }}
            reloadLists={reloadLists}
            checklist={checklists.find((c) => c.id === "cqa-v1")}
            open={(id, dataset, metric, turns) =>
              open(id, metric, dataset, turns)
            }
          />
        )}
        {view === "checklists" && (
          <ChecklistEditor
            checklists={checklists}
            saved={async () => {
              await reloadLists();
            }}
          />
        )}
      </main>
      {selected && (
        <ConversationDrawer
          key={`${selected.dataset}/${selected.id}`}
          {...selected}
          checklists={checklists}
          close={() => setSelected(undefined)}
          changed={() => {
            setRevision((v) => v + 1);
            void reloadLists().catch((e) => setError(errorText(e)));
          }}
        />
      )}
    </div>
  );
}
