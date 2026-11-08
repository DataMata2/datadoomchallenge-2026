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
  type SavedObservation,
} from "./api";
import Analysis from "./Analysis";
import { calendarBounds } from "./domain";
import ConversationDrawer from "./ConversationDrawer";
import ChecklistEditor from "./ChecklistEditor";
import ReportWorkspace from "./ReportWorkspace";
import { Empty, ErrorBox, errorText, metricIds } from "./ui";
import Icon from "./Icon";
import DatasetImport from "./DatasetImport";
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
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [view]);
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
    saved?: SavedObservation;
  }>();
  const [reportId, setReportId] = useState<string>(
    () => localStorage.getItem("cqa-report") || "",
  );
  useEffect(() => {
    localStorage.setItem("cqa-report", reportId);
  }, [reportId]);
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
    saved?: SavedObservation,
  ) => setSelected({ id, metric, dataset, turns, saved });
  const savedReport = async () => {
    setError("");
    try {
      const r = await api.saveReport({
        ...spec,
        group_by: group,
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
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("overview");
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 46" fill="none">
              <path d="M3 3h34v9H13v8h19v9H13v14L3 36V3Z" fill="currentColor" />
              <path
                d="M13 29h12l-12 14V29Z"
                fill="currentColor"
                opacity=".45"
              />
            </svg>
          </span>
          <span className="brand-name">
            FREEDOM<span>QUALITY INTELLIGENCE</span>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-symbol">Q</span>
          <span>
            Quality workspace<small>Conversation analytics</small>
          </span>
          <Icon name="chevron" size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Workspace">
          <button
            className={view === "overview" ? "active" : ""}
            aria-current={view === "overview" ? "page" : undefined}
            onClick={() => setView("overview")}
          >
            <Icon name="overview" />
            Overview
          </button>
          <button
            className={view === "reports" ? "active" : ""}
            aria-current={view === "reports" ? "page" : undefined}
            onClick={() => setView("reports")}
          >
            <Icon name="sparkle" />
            Assistant & reports
          </button>
          <button
            className={view === "checklists" ? "active" : ""}
            aria-current={view === "checklists" ? "page" : undefined}
            onClick={() => setView("checklists")}
          >
            <Icon name="checklist" />
            Checklists
          </button>
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-note">
            <Icon name="shield" />
            <strong>Evidence in every decision.</strong>
            <p>Transparent scores. Traceable reviews. Better conversations.</p>
          </div>
          <span className="local-status">
            <i />
            Local workspace <span>Asia/Almaty</span>
          </span>
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
        <div className="topbar">
          <div className="breadcrumb">
            Workspace
            <Icon name="chevron" size={13} />
            <strong>
              {view === "overview"
                ? "Overview"
                : view === "reports"
                  ? "Assistant & reports"
                  : "Checklists"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="timezone">Asia/Almaty · UTC+5</span>
            <span className="avatar" aria-label="Quality review workspace">
              QA
            </span>
          </div>
        </div>
        <div className="workspace-content" id="workspace-content">
          <header className="page-head">
            <div>
              <span className="eyebrow">CONVERSATION QUALITY ANALYTICS</span>
              <h1>
                {view === "overview"
                  ? "A clearer view of quality."
                  : view === "reports"
                    ? "Ask. Explore. Understand."
                    : "Your standard. Every conversation."}
              </h1>
              <p>
                {view === "overview"
                  ? "Every conversation tells a story. Turn yours into better service."
                  : view === "reports"
                    ? "Keep the analysis, its filters and source conversations together."
                    : "Save a new checklist version and evaluate it explicitly."}
              </p>
            </div>
            <button
              className="primary import-trigger"
              onClick={() => setImporting(true)}
            >
              <Icon name="upload" size={17} />
              Import conversations
            </button>
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
                className="filter-bar overview-filters"
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
                      <option value="12,0">
                        Afternoon/evening: 12:00–24:00
                      </option>
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
                      <option value="true">
                        KZ public holidays (observed)
                      </option>
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
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
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
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
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
                <details>
                  <summary>About calendar dates</summary>
                  <p>
                    Assigned demo dates are separate from original timestamps
                    and independent of scores.{" "}
                    {Array.isArray(meta?.scheduling.algorithms)
                      ? meta.scheduling.algorithms.join(", ")
                      : "No scheduling algorithm"}{" "}
                    · seed {String(meta?.scheduling.seed ?? "none")}.
                  </p>
                </details>
                <button disabled={!output || loading} onClick={savedReport}>
                  Save selection as report
                </button>
              </div>
              {loading ? (
                <Empty>
                  Loading the selected conversations and quality measures…
                </Empty>
              ) : output && !!meta?.datasets.length ? (
                <Analysis
                  key={filters.dataset_id}
                  output={output}
                  comparison={comparison}
                  sources={sources}
                  checklist={checklists.find((c) => c.id === "cqa-v1")}
                  open={(id, metric, turns) =>
                    open(id, metric, filters.dataset_id, turns)
                  }
                />
              ) : (
                <div className="empty-onboarding">
                  <span className="upload-orbit">
                    <Icon name="chat" size={30} />
                  </span>
                  <h2>Your next insight starts with a conversation.</h2>
                  <p>
                    Import a JSON dataset to explore conversations, evaluate
                    quality and follow the evidence.
                  </p>
                  <button
                    className="primary"
                    onClick={() => setImporting(true)}
                  >
                    <Icon name="upload" size={17} />
                    Import your first conversations
                  </button>
                </div>
              )}
            </>
          )}
          {view === "reports" && (
            <ReportWorkspace
              reports={reports}
              sourceRevision={revision}
              selectedId={reportId}
              select={setReportId}
              reloadLists={reloadLists}
              checklist={checklists.find((c) => c.id === "cqa-v1")}
              open={(id, dataset, metric, turns, saved) =>
                open(id, metric, dataset, turns, saved)
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
          <footer className="page-footer">
            <span>
              FREEDOM <span>/</span> Quality intelligence
            </span>
            <span>Built around the conversation.</span>
          </footer>
        </div>
      </main>
      {importing && (
        <DatasetImport
          close={() => {
            setImporting(false);
            void api
              .meta()
              .then(setMeta)
              .catch((e) => setError(errorText(e)));
          }}
          imported={async (result) => {
            const [m, c, r, u] = await Promise.all([
              api.meta(),
              api.checklists(),
              api.reports(),
              api.usage(),
            ]);
            setMeta(m);
            setChecklists(c.items);
            setReports(r.items);
            setUsage(u);
            setStart("");
            setEnd("");
            setFilters({ dataset_id: result.dataset_id });
            setView("overview");
            setRevision((v) => v + 1);
            setImporting(false);
          }}
        />
      )}
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
