import { message, t, useLocale } from "./i18n";
import LanguageSwitcher from "./LanguageSwitcher";
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
import { Empty, ErrorBox, errorText, metricIds, score } from "./ui";
import Icon from "./Icon";
import DatasetImport from "./DatasetImport";
import Settings from "./Settings";
import { languageName } from "./locale";
const groups = [
  "channel",
  "language",
  "month_half",
  "day_night",
  "holiday",
  "date",
] as const;
export default function App() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `Freedom · ${t("Quality intelligence")}`;
  }, [locale]);
  const [view, setView] = useState<
    "overview" | "reports" | "checklists" | "settings"
  >("overview");
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
    title: t("Conversation quality overview"),
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
        title: t("Quality review · {arg0}", { arg0: start || t("all dates") }),
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
        {t("Skip to workspace")}
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
            FREEDOM<span>{t("QUALITY INTELLIGENCE")}</span>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-symbol">Q</span>
          <span>
            {t("Quality workspace")}
            <small>{t("Conversation analytics")}</small>
          </span>
          <Icon name="chevron" size={14} />
        </div>
        <span className="nav-label">{t("WORKSPACE")}</span>
        <nav aria-label={t("Workspace")}>
          <button
            className={view === "overview" ? "active" : ""}
            aria-current={view === "overview" ? "page" : undefined}
            onClick={() => setView("overview")}
          >
            <Icon name="overview" />
            {t("Overview")}
          </button>
          <button
            className={view === "reports" ? "active" : ""}
            aria-current={view === "reports" ? "page" : undefined}
            onClick={() => setView("reports")}
          >
            <Icon name="sparkle" />
            {t("Assistant & reports")}
          </button>
          <button
            className={view === "checklists" ? "active" : ""}
            aria-current={view === "checklists" ? "page" : undefined}
            onClick={() => setView("checklists")}
          >
            <Icon name="checklist" />
            {t("Checklists")}
          </button>
          <button
            className={view === "settings" ? "active" : ""}
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => setView("settings")}
          >
            <Icon name="filter" />
            {t("Settings")}
          </button>
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-note">
            <Icon name="shield" />
            <strong>{t("Evidence in every decision.")}</strong>
            <p>
              {t(
                "Transparent scores. Traceable reviews. Better conversations.",
              )}
            </p>
          </div>
          <span className="local-status">
            <i />
            {t("Local workspace ")}
            <span>Asia/Almaty</span>
          </span>
          {usage && (
            <details>
              <summary>
                {t("Model usage: $")}
                {score(usage.spent_usd)}
              </summary>
              <p>
                ${score(usage.reserved_usd)} {t(" reserved")}
                <br />${score(usage.working_remaining_usd)}{" "}
                {t(" working allowance left")}
                <br />${usage.hard_limit_usd} {t(" hard limit")}
              </p>
            </details>
          )}
        </div>
      </aside>
      <main>
        <div className="topbar">
          <div className="breadcrumb">
            {t("Workspace")}
            <Icon name="chevron" size={13} />
            <strong>
              {view === "overview"
                ? t("Overview")
                : view === "reports"
                  ? t("Assistant & reports")
                  : view === "checklists"
                    ? t("Checklists")
                    : t("Settings")}
            </strong>
          </div>
          <div className="topbar-right">
            <LanguageSwitcher />
            <span className="timezone">Asia/Almaty · UTC+5</span>
            <span className="avatar" aria-label={t("Quality review workspace")}>
              QA
            </span>
          </div>
        </div>
        <div className="workspace-content" id="workspace-content">
          <header className="page-head">
            <div>
              <span className="eyebrow">
                {t("CONVERSATION QUALITY ANALYTICS")}
              </span>
              <h1>
                {view === "overview"
                  ? t("A clearer view of quality.")
                  : view === "reports"
                    ? t("Ask. Explore. Understand.")
                    : view === "checklists"
                      ? t("Your standard. Every conversation.")
                      : t("The language of new results.")}
              </h1>
              <p>
                {view === "overview"
                  ? t(
                      "Every conversation tells a story. Turn yours into better service.",
                    )
                  : view === "reports"
                    ? t(
                        "Keep the analysis, its filters and source conversations together.",
                      )
                    : view === "checklists"
                      ? t(
                          "Save a new checklist version and evaluate it explicitly.",
                        )
                      : t("Saved results keep their original language.")}
              </p>
            </div>
            <button
              className="primary import-trigger"
              onClick={() => setImporting(true)}
            >
              <Icon name="upload" size={17} />
              {t("Import conversations")}
            </button>
          </header>
          {error && (
            <ErrorBox>
              {message(error)}{" "}
              <button
                onClick={() =>
                  meta ? setRevision((v) => v + 1) : setBootstrap((v) => v + 1)
                }
              >
                {t("Retry overview")}
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
                  {t("Dataset")}
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
                  {t("From")}
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  {t("Through")}
                  <input
                    type="date"
                    value={end}
                    min={start || undefined}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
                <button type="submit">{t("Apply dates")}</button>
                <label>
                  {t("Channel")}
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
                    <option value="">{t("All channels")}</option>
                    {meta?.channels.map((c) => (
                      <option key={c} value={c}>
                        {t(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Language")}
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
                    <option value="">{t("All languages")}</option>
                    {meta?.languages.map((c) => (
                      <option key={c} value={c}>
                        {languageName(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Compare by")}
                  <select
                    value={group}
                    onChange={(e) => setGroup(e.target.value as typeof group)}
                  >
                    {groups.map((c) => (
                      <option key={c} value={c}>
                        {t(c.replaceAll("_", " "))}
                      </option>
                    ))}
                  </select>
                </label>
              </form>
              <details className="advanced-filters">
                <summary>
                  {t("Additional calendar and quality filters")}
                </summary>
                <div className="filter-bar">
                  <label>
                    {t("Local hours")}
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
                      <option value="">{t("All hours")}</option>
                      <option value="6,18">{t("Day: 06:00–18:00")}</option>
                      <option value="18,6">{t("Night: 18:00–06:00")}</option>
                      <option value="12,0">
                        {t("Afternoon/evening: 12:00–24:00")}
                      </option>
                    </select>
                  </label>
                  <label>
                    {t("Holiday calendar")}
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
                      <option value="">{t("All dates")}</option>
                      <option value="true">
                        {t("KZ public holidays (observed)")}
                      </option>
                      <option value="false">
                        {t("Exclude KZ public holidays")}
                      </option>
                    </select>
                  </label>
                  <label>
                    {t("Weekdays")}
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
                      <option value="">{t("All weekdays")}</option>
                      <option value="1,2,3,4,5">{t("Monday–Friday")}</option>
                      <option value="6,7">{t("Saturday–Sunday")}</option>
                    </select>
                  </label>
                  <label>
                    {t("Minimum score")}
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
                    {t("Maximum score")}
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
                    {t("Critical flag")}
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
                      <option value="">{t("Any status")}</option>
                      <option value="true">{t("Critical flagged")}</option>
                      <option value="false">{t("No critical flag")}</option>
                    </select>
                  </label>
                </div>
                <small>
                  {t(
                    "Hours end exclusively. Holidays include observed Kazakhstan public holidays; ordinary weekends use the weekday filter.",
                  )}
                </small>
              </details>
              <div className="row provenance">
                <details>
                  <summary>{t("About calendar dates")}</summary>
                  <p>
                    {t(
                      "Assigned demo dates are separate from original timestamps and independent of scores.",
                    )}{" "}
                    {Array.isArray(meta?.scheduling.algorithms)
                      ? meta.scheduling.algorithms
                          .map((algorithm) => t(String(algorithm)))
                          .join(", ")
                      : t("No scheduling algorithm")}{" "}
                    {t(" · seed ")}
                    {String(meta?.scheduling.seed ?? t("none"))}.
                  </p>
                </details>
                <button disabled={!output || loading} onClick={savedReport}>
                  {t("Save selection as report")}
                </button>
              </div>
              {loading ? (
                <Empty>
                  {t(
                    "Loading the selected conversations and quality measures…",
                  )}
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
                  <h2>{t("Your next insight starts with a conversation.")}</h2>
                  <p>
                    {t(
                      "Import a JSON dataset to explore conversations, evaluate quality and follow the evidence.",
                    )}
                  </p>
                  <button
                    className="primary"
                    onClick={() => setImporting(true)}
                  >
                    <Icon name="upload" size={17} />
                    {t("Import your first conversations")}
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
          {view === "settings" && <Settings />}
          <footer className="page-footer">
            <span>
              FREEDOM <span>/</span> {t(" Quality intelligence")}
            </span>
            <span>{t("Built around the conversation.")}</span>
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
