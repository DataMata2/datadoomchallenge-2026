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
import Settings from "./Settings";
import { channelName, languageName, groupNames, label } from "./locale";
const groups = [
  "channel",
  "language",
  "month_half",
  "day_night",
  "holiday",
  "date",
] as const;
export default function App() {
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
    title: "Обзор качества диалогов",
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
        title: `Обзор качества · ${start || "все даты"}`,
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
        Перейти к рабочей области
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
            FREEDOM<span>АНАЛИТИКА КАЧЕСТВА</span>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-symbol">Q</span>
          <span>
            Контроль качества<small>Аналитика диалогов</small>
          </span>
          <Icon name="chevron" size={14} />
        </div>
        <span className="nav-label">РАБОЧАЯ ОБЛАСТЬ</span>
        <nav aria-label="Рабочая область">
          <button
            className={view === "overview" ? "active" : ""}
            aria-current={view === "overview" ? "page" : undefined}
            onClick={() => setView("overview")}
          >
            <Icon name="overview" />
            Обзор
          </button>
          <button
            className={view === "reports" ? "active" : ""}
            aria-current={view === "reports" ? "page" : undefined}
            onClick={() => setView("reports")}
          >
            <Icon name="sparkle" />
            Ассистент и отчёты
          </button>
          <button
            className={view === "checklists" ? "active" : ""}
            aria-current={view === "checklists" ? "page" : undefined}
            onClick={() => setView("checklists")}
          >
            <Icon name="checklist" />
            Чек-листы
          </button>
          <button
            className={view === "settings" ? "active" : ""}
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => setView("settings")}
          >
            <Icon name="filter" />
            Настройки
          </button>
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-note">
            <Icon name="shield" />
            <strong>Доказательства для каждого решения.</strong>
            <p>Прозрачные оценки. Проверяемые решения. Качественный сервис.</p>
          </div>
          <span className="local-status">
            <i />
            Локальная рабочая область <span>Asia/Almaty</span>
          </span>
          {usage && (
            <details>
              <summary>
                Расходы на модель: $
                {usage.spent_usd.toLocaleString("ru-RU", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </summary>
              <p>
                $
                {usage.reserved_usd.toLocaleString("ru-RU", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                зарезервировано
                <br />$
                {usage.working_remaining_usd.toLocaleString("ru-RU", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                осталось в рабочем бюджете
                <br />${usage.hard_limit_usd} предельный бюджет
              </p>
            </details>
          )}
        </div>
      </aside>
      <main>
        <div className="topbar">
          <div className="breadcrumb">
            Рабочая область
            <Icon name="chevron" size={13} />
            <strong>
              {view === "overview"
                ? "Обзор"
                : view === "reports"
                  ? "Ассистент и отчёты"
                  : view === "checklists"
                    ? "Чек-листы"
                    : "Настройки"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="timezone">Asia/Almaty · UTC+5</span>
            <span
              className="avatar"
              aria-label="Рабочая область контроля качества"
            >
              QA
            </span>
          </div>
        </div>
        <div className="workspace-content" id="workspace-content">
          <header className="page-head">
            <div>
              <span className="eyebrow">АНАЛИТИКА КАЧЕСТВА ДИАЛОГОВ</span>
              <h1>
                {view === "overview"
                  ? "Качество сервиса в деталях."
                  : view === "reports"
                    ? "Спрашивайте. Исследуйте. Понимайте."
                    : view === "checklists"
                      ? "Ваш стандарт для каждого диалога."
                      : "Язык новых результатов."}
              </h1>
              <p>
                {view === "overview"
                  ? "Каждый диалог помогает понять, как улучшить сервис."
                  : view === "reports"
                    ? "Анализ, фильтры и исходные диалоги в одном отчёте."
                    : view === "checklists"
                      ? "Сохраните новую версию чек-листа и запустите оценку отдельно."
                      : "Сохранённые результаты сохраняют исходный язык."}
              </p>
            </div>
            <button
              className="primary import-trigger"
              onClick={() => setImporting(true)}
            >
              <Icon name="upload" size={17} />
              Импортировать диалоги
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
                Повторить загрузку обзора
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
                  Набор данных
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
                  С даты
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  По дату
                  <input
                    type="date"
                    value={end}
                    min={start || undefined}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
                <button type="submit">Применить даты</button>
                <label>
                  Канал
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
                    <option value="">Все каналы</option>
                    {meta?.channels.map((c) => (
                      <option key={c} value={c}>
                        {channelName(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Язык диалога
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
                    <option value="">Все языки</option>
                    {meta?.languages.map((c) => (
                      <option key={c} value={c}>
                        {languageName(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Сравнить по
                  <select
                    value={group}
                    onChange={(e) => setGroup(e.target.value as typeof group)}
                  >
                    {groups.map((c) => (
                      <option key={c} value={c}>
                        {groupNames[c] || c}
                      </option>
                    ))}
                  </select>
                </label>
              </form>
              <details className="advanced-filters">
                <summary>Дополнительные фильтры по времени и качеству</summary>
                <div className="filter-bar">
                  <label>
                    Местное время
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
                      <option value="">Любое время</option>
                      <option value="6,18">День: 06:00–18:00</option>
                      <option value="18,6">Ночь: 18:00–06:00</option>
                      <option value="12,0">
                        Вторая половина дня: 12:00–24:00
                      </option>
                    </select>
                  </label>
                  <label>
                    Календарь праздников
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
                      <option value="">Все даты</option>
                      <option value="true">
                        Праздники Казахстана с переносами
                      </option>
                      <option value="false">
                        Исключить праздники Казахстана
                      </option>
                    </select>
                  </label>
                  <label>
                    Дни недели
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
                      <option value="">Все дни недели</option>
                      <option value="1,2,3,4,5">Понедельник–пятница</option>
                      <option value="6,7">Суббота–воскресенье</option>
                    </select>
                  </label>
                  <label>
                    Минимальная оценка
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
                    Максимальная оценка
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
                    Критическое нарушение
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
                      <option value="">Любой статус</option>
                      <option value="true">С критическим нарушением</option>
                      <option value="false">Без критического нарушения</option>
                    </select>
                  </label>
                </div>
                <small>
                  Конечный час не включается. Праздники Казахстана учитывают
                  переносы; обычные выходные задаются фильтром дней недели.
                </small>
              </details>
              <div className="row provenance">
                <details>
                  <summary>О календарных датах</summary>
                  <p>
                    Демонстрационные даты назначаются отдельно от исходных
                    временных меток и не зависят от оценок.{" "}
                    {Array.isArray(meta?.scheduling.algorithms)
                      ? meta.scheduling.algorithms
                          .map((algorithm) => label(String(algorithm)))
                          .join(", ")
                      : "Алгоритм не задан"}{" "}
                    · начальное значение{" "}
                    {String(meta?.scheduling.seed ?? "нет")}.
                  </p>
                </details>
                <button disabled={!output || loading} onClick={savedReport}>
                  Сохранить выборку как отчёт
                </button>
              </div>
              {loading ? (
                <Empty>
                  Загрузка выбранных диалогов и показателей качества…
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
                  <h2>Начните исследование с диалога.</h2>
                  <p>
                    Импортируйте набор данных JSON, чтобы исследовать диалоги,
                    оценивать качество и проверять доказательства.
                  </p>
                  <button
                    className="primary"
                    onClick={() => setImporting(true)}
                  >
                    <Icon name="upload" size={17} />
                    Импортировать первые диалоги
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
              FREEDOM <span>/</span> Аналитика качества
            </span>
            <span>В центре внимания — диалог.</span>
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
