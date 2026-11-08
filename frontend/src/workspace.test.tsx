/** Synthetic contract/component tests. No browser, provider, or runtime DB is used. */
import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { act } from "react";
import type { Root } from "react-dom/client";
let createRoot: typeof import("react-dom/client").createRoot;
import App from "./App";
import Analysis from "./Analysis";
import ConversationDrawer from "./ConversationDrawer";
import ReportWorkspace from "./ReportWorkspace";
import DatasetImport from "./DatasetImport";
import Settings from "./Settings";
import { criterionDisplay } from "./locale";
import { score } from "./ui";
import type {
  AnalysisOutput,
  Checklist,
  ConversationResponse,
  Report,
} from "./api";
const fixtures = JSON.parse(
  readFileSync(
    new URL("../../docs/api-examples.json", import.meta.url),
    "utf8",
  ),
).implemented;
let dom: JSDOM;
let root: Root;
let container: HTMLDivElement;
let calls: Array<{ path: string; body: unknown }>;
let route: (path: string, body: any) => unknown;
beforeEach(async () => {
  dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://localhost:5173" },
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLDialogElement: dom.window.HTMLDialogElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  ({ createRoot } = await import("react-dom/client"));
  container = document.getElementById("root") as HTMLDivElement;
  root = createRoot(container);
  calls = [];
  route = (path, body) => {
    if (path === "/api/settings") return { analysis_language: "RU" };
    if (path === "/api/meta") return fixtures.meta;
    if (path === "/api/checklists")
      return { items: [fixtures.checklist], total: 1 };
    if (path === "/api/reports") return { items: [fixtures.report], total: 1 };
    if (path === "/api/usage") return fixtures.usage;
    if (path === "/api/analytics") return { ...fixtures.analysis, spec: body };
    if (path === "/api/conversations/search") return fixtures.conversation_page;
    if (path.startsWith("/api/conversations/"))
      return {
        ...fixtures.conversation,
        evaluation_id: fixtures.evaluation.id,
      };
    if (path.startsWith("/api/evaluations/")) return fixtures.evaluation;
    if (path.startsWith("/api/reports/")) return fixtures.report;
    throw new Error(`Unexpected synthetic API request: ${path}`);
  };
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    const result = await route(path, body);
    if (result instanceof Response) return result;
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
function button(text: string) {
  const found = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  );
  assert.ok(found, `Button ${text} exists`);
  return found;
}
function select(label: string) {
  const found = Array.from(container.querySelectorAll("label"))
    .find((l) => l.textContent?.trim().startsWith(label))
    ?.querySelector("select");
  assert.ok(found, `Select ${label} exists`);
  return found;
}

test("overview filter changes send actual backend selections and show interpreted filter chips", async () => {
  await act(async () => root.render(<App />));
  await settle();
  const first = calls.find((c) => c.path === "/api/analytics")
    ?.body as AnalysisOutput["spec"];
  assert.equal(first.filters?.start_at, "2026-10-01T00:00:00+05:00");
  assert.equal(first.filters?.end_at, "2026-11-01T00:00:00+05:00");
  await act(async () => {
    select("Язык диалога").value = "RU";
    select("Язык диалога").dispatchEvent(
      new dom.window.Event("change", { bubbles: true }),
    );
  });
  await settle();
  assert.ok(
    calls.some(
      (c) =>
        c.path === "/api/conversations/search" &&
        (c.body as { language?: string }).language === "RU",
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.path === "/api/analytics" &&
        (c.body as AnalysisOutput["spec"]).filters?.language === "RU",
    ),
  );
  assert.match(container.querySelector(".chips")?.textContent || "", /RU/);
  assert.equal(
    calls.filter((c) => c.path === "/api/assistant" || c.path === "/api/runs")
      .length,
    0,
  );
});

test("aggregate inspection preserves denominator, N/A semantics and exact one-based evidence target", async () => {
  let opened: unknown[] = [];
  await act(async () =>
    root.render(
      <Analysis
        output={fixtures.analysis as AnalysisOutput}
        sources={[fixtures.conversation as ConversationResponse]}
        checklist={fixtures.checklist as Checklist}
        open={(...args) => {
          opened = args;
        }}
      />,
    ),
  );
  const tile = container.querySelector(
    ".metric-tile:nth-child(2)",
  ) as HTMLButtonElement;
  assert.ok(tile);
  await act(async () => tile.click());
  const dialog = container.querySelector("dialog");
  assert.ok(dialog?.open);
  assert.match(dialog.textContent || "", /учтённым диалогам/);
  assert.match(dialog.textContent || "", /Н\/П/);
  const evidence = dialog.querySelector(".turn-link") as HTMLButtonElement;
  assert.ok(evidence);
  await act(async () => evidence.click());
  assert.deepEqual(opened, ["fictional-001", "dialogue", [1]]);
});

test("conversation criterion highlights the full original turn indices and preserves raw/weighted explanation", async () => {
  await act(async () =>
    root.render(
      <ConversationDrawer
        id="fictional-001"
        dataset="FICTIONAL"
        metric="dialogue"
        checklists={[fixtures.checklist]}
        close={() => {}}
        changed={() => {}}
      />,
    ),
  );
  await settle();
  assert.equal(
    container.querySelectorAll(".turns li").length,
    fixtures.conversation.transcript.length,
  );
  assert.equal(container.querySelectorAll(".turns li.highlight").length, 2);
  assert.match(container.textContent || "", /Исходное значение/);
  assert.match(container.textContent || "", /Взвешенный вклад/);
  assert.match(container.textContent || "", /Исходная расшифровка/);
  assert.equal(
    calls.some((c) => c.path === "/api/runs"),
    false,
  );
});

test("draft reports ask for clarification; ready reports expose custom coverage without changing regular quality", async () => {
  const draft: Report = {
    ...fixtures.report,
    id: "draft-test",
    title: "Draft question",
    status: "draft",
    spec: null,
    output: null,
    stale: false,
    messages: [],
    custom_metrics: [],
  };
  route = (path) => {
    if (path === "/api/reports/draft-test") return draft;
    throw new Error(`Unexpected draft request ${path}`);
  };
  const props = {
    reports: [draft],
    selectedId: draft.id,
    select: () => {},
    reloadLists: async () => {},
    open: () => {},
  };
  await act(async () => root.render(<ReportWorkspace {...props} />));
  await settle();
  assert.match(container.textContent || "", /Это черновик отчёта/);
  assert.equal(
    Array.from(container.querySelectorAll("button")).some(
      (b) => b.textContent === "Задать пользовательскую метрику",
    ),
    false,
  );
  const ready: Report = structuredClone(fixtures.report);
  const result = fixtures.custom_assessment;
  ready.custom_metrics = [
    {
      definition: fixtures.custom_metric_request,
      run_ids: [],
      latest_run_id: null,
      status: "not_run",
      runs: [],
      results: [result],
      aggregate: {
        value: 0,
        unit: "percent_true",
        selected_count: 2,
        assessed_count: 1,
        sample_count: 1,
        na_count: 0,
        failed_count: 0,
        pending_count: 0,
        cancelled_count: 0,
        interrupted_count: 0,
        uncovered_count: 1,
        distribution: { false: 1 },
      },
      out_of_scope_count: 0,
      groups: [],
    },
  ];
  route = (path) =>
    path === "/api/conversations/search" ? fixtures.conversation_page : ready;
  await act(async () =>
    root.render(
      <ReportWorkspace {...props} reports={[ready]} selectedId={ready.id} />,
    ),
  );
  await settle();
  assert.match(container.textContent || "", /1 применимо \/ 2 выбрано/);
  const metric = container.querySelector(".custom-metric") as HTMLButtonElement;
  await act(async () => metric.click());
  assert.match(
    container.querySelector("dialog")?.textContent || "",
    /1 без оценки/,
  );
  assert.match(
    container.querySelector("dialog")?.textContent || "",
    new RegExp(`Исходная реплика №${result.judgment.evidence_turns[0]}`),
  );
  assert.equal(
    calls.some((c) => c.path.endsWith("/metrics")),
    false,
  );
  ready.stale = true;
  await act(async () =>
    root.render(
      <ReportWorkspace
        {...props}
        reports={[ready]}
        selectedId={ready.id}
        sourceRevision={1}
      />,
    ),
  );
  await settle();
  assert.match(container.textContent || "", /Исходные оценки изменились/);
});

async function saveOverviewSelection() {
  const originalRoute = route;
  let saved: Report | undefined;
  route = (path, body) => {
    if (path === "/api/reports" && body) {
      saved = {
        ...structuredClone(fixtures.report),
        id: "new-saved-report",
        title: body.title,
        spec: body,
        output: { ...structuredClone(fixtures.analysis), spec: body },
      };
      return saved;
    }
    if (path === "/api/reports")
      return {
        items: saved ? [saved, fixtures.report] : [fixtures.report],
        total: saved ? 2 : 1,
      };
    if (path === "/api/reports/new-saved-report") return saved;
    return originalRoute(path, body);
  };
  localStorage.setItem("cqa-report", "previous-report");
  await act(async () => root.render(<App />));
  await settle();
  await act(async () => {
    select("Сравнить по").value = "month_half";
    select("Сравнить по").dispatchEvent(
      new dom.window.Event("change", { bubbles: true }),
    );
  });
  await settle();
  await act(async () => button("Сохранить выборку как отчёт").click());
  await settle();
  assert.ok(saved, "The overview selection was saved");
  assert.equal(select("Сохранённый отчёт").value, "new-saved-report");
  return saved;
}

test("saving and reopening an overview retains its displayed non-default comparison", async () => {
  const saved = await saveOverviewSelection();
  assert.equal(saved.spec?.group_by, "month_half");
  assert.equal(
    container.querySelectorAll(".bar-chart").length,
    1,
    "The saved report retains its comparison chart",
  );
  await act(async () => {
    select("Сохранённый отчёт").value = fixtures.report.id;
    select("Сохранённый отчёт").dispatchEvent(
      new dom.window.Event("change", { bubbles: true }),
    );
  });
  await settle();
  await act(async () => {
    select("Сохранённый отчёт").value = saved.id;
    select("Сохранённый отчёт").dispatchEvent(
      new dom.window.Event("change", { bubbles: true }),
    );
  });
  await settle();
  assert.equal(select("Сохранённый отчёт").value, saved.id);
  assert.equal(saved.output?.spec.group_by, "month_half");
  assert.equal(
    container.querySelectorAll(".bar-chart").length,
    1,
    "Reopening the saved report restores its comparison",
  );
});

test("saving an overview persists the new report selection through a complete App remount", async () => {
  await saveOverviewSelection();
  assert.equal(localStorage.getItem("cqa-report"), "new-saved-report");
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<App />));
  await settle();
  await act(async () => button("Ассистент и отчёты").click());
  await settle();
  assert.equal(select("Сохранённый отчёт").value, "new-saved-report");
});

test("saved report drilldown preserves copied judgment when the same evaluation is reviewed", async () => {
  const originalRoute = route;
  const saved = structuredClone(fixtures.report);
  const observation = saved.output.observations[0];
  observation.evaluation_id = fixtures.evaluation.id;
  observation.revision = "saved-revision-before-review";
  observation.final.criteria.find(
    (c: any) => c.criterion_id === "dialogue",
  ).rationale = "Copied report rationale before review";
  const current = structuredClone(fixtures.evaluation);
  current.final.criteria.find((c: any) => c.criterion_id === "dialogue").value =
    0;
  current.final.criteria.find(
    (c: any) => c.criterion_id === "dialogue",
  ).rationale = "Current reviewer rationale";
  saved.stale = true;
  route = (path, body) =>
    path === `/api/reports/${saved.id}`
      ? saved
      : path.startsWith("/api/evaluations/")
        ? current
        : originalRoute(path, body);
  localStorage.setItem("cqa-report", saved.id);
  await act(async () => root.render(<App />));
  await settle();
  await act(async () => button("Ассистент и отчёты").click());
  await settle();
  const tile = Array.from(container.querySelectorAll(".metric-tile")).find(
    (b) => b.textContent?.includes("Ведение диалога"),
  ) as HTMLButtonElement;
  assert.ok(tile);
  await act(async () => tile.click());
  const evidence = container.querySelector(
    "dialog .turn-link",
  ) as HTMLButtonElement;
  assert.ok(evidence);
  await act(async () => evidence.click());
  await settle();
  const snapshot = container.querySelector(
    "[aria-label='Сохранённая оценка отчёта']",
  );
  assert.ok(snapshot);
  assert.match(
    snapshot.textContent || "",
    /Copied report rationale before review/,
  );
  assert.match(snapshot.textContent || "", /saved-revision-before-review/);
  assert.equal(
    snapshot.querySelector("time")?.title,
    saved.output.generated_at,
  );
  assert.match(snapshot.textContent || "", new RegExp(fixtures.evaluation.id));
  assert.match(
    container.textContent || "",
    /Текущие значения отличаются от сохранённых в отчёте/,
  );
  assert.match(container.textContent || "", /Current reviewer rationale/);
  assert.equal(
    calls.some((c) => c.path.includes("/refresh") || c.path === "/api/runs"),
    false,
  );
});

function field(row: Element, label: string) {
  const control = Array.from(row.querySelectorAll("label"))
    .find((l) => l.textContent?.trim().startsWith(label))
    ?.querySelector("input, textarea, select") as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | undefined;
  assert.ok(control, `Field ${label} exists`);
  return control;
}
async function typeValue(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  await act(async () => {
    const prototype =
      control instanceof dom.window.HTMLTextAreaElement
        ? dom.window.HTMLTextAreaElement.prototype
        : control instanceof dom.window.HTMLSelectElement
          ? dom.window.HTMLSelectElement.prototype
          : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      control,
      value,
    );
    control.dispatchEvent(
      new dom.window.Event(
        control instanceof dom.window.HTMLSelectElement ? "change" : "input",
        { bubbles: true },
      ),
    );
  });
}

test("checklist criteria set can replace definitions and apply the returned immutable version", async () => {
  const baseline = structuredClone(fixtures.checklist);
  const before = JSON.stringify(baseline);
  const originalRoute = route;
  let created: Checklist | undefined;
  route = (path, body) => {
    if (path === "/api/checklists" && body)
      return (created = {
        ...structuredClone(baseline),
        ...body,
        id: "cqa-version-returned-by-server",
      });
    if (path === "/api/checklists")
      return {
        items: created ? [baseline, created] : [baseline],
        total: created ? 2 : 1,
      };
    if (
      path.startsWith("/api/conversations/") &&
      path.includes("cqa-version-returned-by-server")
    )
      return { ...fixtures.conversation, evaluation_id: null };
    if (path === "/api/runs")
      return {
        ...fixtures.run,
        id: "synthetic-apply-run",
        status: "completed",
        finished_at: "2026-11-08T00:00:00Z",
        checklist_version_id: created?.id,
        checklist_snapshot: created,
      };
    return originalRoute(path, body);
  };
  await act(async () => root.render(<App />));
  await settle();
  await act(async () => button("Чек-листы").click());
  await settle();
  const originalRows = container.querySelectorAll(".criterion-editor").length;
  Array.from(container.querySelectorAll(".criterion-editor")).forEach(
    (row, index) => {
      assert.equal(
        field(row, "Тип ответа").value,
        baseline.criteria[index].answer_type,
        "Display translation preserves canonical select values",
      );
    },
  );
  await act(async () => button("Добавить критерий").click());
  const rows = container.querySelectorAll(".criterion-editor");
  assert.equal(rows.length, originalRows + 1);
  const added = rows[rows.length - 1];
  assert.equal(field(added, "Тип ответа").value, "boolean");
  const identity = field(added, "Идентификатор критерия") as HTMLInputElement;
  assert.equal(identity.disabled, false);
  assert.equal(
    new RegExp(identity.pattern, "v").test("replacement-metric"),
    true,
  );
  identity.focus();
  await typeValue(identity, "replacement_a");
  assert.equal(
    field(added, "Идентификатор критерия"),
    identity,
    "Editing identity preserves the row input",
  );
  assert.equal(
    document.activeElement,
    identity,
    "Editing identity preserves focus",
  );
  await typeValue(identity, "replacement_metric");
  assert.equal(document.activeElement, identity);
  const replacedId = baseline.criteria[0].id;
  const remove = Array.from(rows[0].querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Удалить критерий",
  );
  assert.ok(remove);
  await act(async () => remove.click());
  assert.equal(
    container.querySelectorAll(".criterion-editor").length,
    originalRows,
  );
  assert.equal(field(added, "Идентификатор критерия"), identity);
  await typeValue(field(added, "Название"), "Synthetic replacement");
  await typeValue(
    field(added, "Формулировка критерия"),
    "Assess the stated fictional property.",
  );
  await typeValue(field(added, "Тип ответа"), "scale");
  assert.equal(field(added, "Тип ответа").value, "scale");
  await typeValue(field(added, "Вес"), "7");
  await typeValue(field(added, "Допустимые значения шкалы"), "0, 5, 10");
  await act(async () =>
    (field(added, "Разрешить Н/П") as HTMLInputElement).click(),
  );
  await typeValue(
    field(added, "Условие Н/П"),
    "The fictional property is not observable.",
  );
  for (const [value, meaning] of [
    ["0", "Absent"],
    ["5", "Partial"],
    ["10", "Present"],
  ])
    await typeValue(field(added, `Значение ${value}`), meaning);
  await typeValue(identity, "Invalid ID");
  await act(async () =>
    added
      .closest("form")!
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.match(
    container.textContent || "",
    /Идентификатор критерия должен начинаться со строчной латинской буквы/,
  );
  assert.equal(
    calls.some((c) => c.path === "/api/checklists" && c.body),
    false,
  );
  await typeValue(identity, "consultation");
  await act(async () =>
    added
      .closest("form")!
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.match(
    container.textContent || "",
    /Идентификаторы критериев должны быть уникальными/,
  );
  assert.equal(
    calls.some((c) => c.path === "/api/checklists" && c.body),
    false,
  );
  await typeValue(identity, "replacement_metric");
  await act(async () => button("Добавить критерий").click());
  const additional = Array.from(
    container.querySelectorAll(".criterion-editor"),
  ).at(-1)!;
  await typeValue(
    field(additional, "Идентификатор критерия"),
    "additional_metric",
  );
  await typeValue(field(additional, "Название"), "Additional fictional check");
  await typeValue(
    field(additional, "Формулировка критерия"),
    "Assess another stated fictional property.",
  );
  await typeValue(field(additional, "Вес"), "3");
  await act(async () => button("Сохранить новую версию чек-листа").click());
  await settle();
  assert.ok(created);
  const request = calls.find((c) => c.path === "/api/checklists" && c.body)!
    .body as any;
  assert.equal(request.parent_version_id, baseline.id);
  assert.equal(
    request.criteria.some((c: any) => c.id === replacedId),
    false,
  );
  assert.equal(request.criteria.length, originalRows + 1);
  assert.equal(
    request.criteria.find((c: any) => c.id === "additional_metric").answer_type,
    "boolean",
  );
  assert.deepEqual(
    request.criteria.find((c: any) => c.id === "replacement_metric"),
    {
      id: "replacement_metric",
      title: "Synthetic replacement",
      description: "Assess the stated fictional property.",
      answer_type: "scale",
      allowed_values: [0, 5, 10],
      weight: 7,
      allow_na: true,
      na_condition: "The fictional property is not observable.",
      critical: false,
      scale_meanings: { "0": "Absent", "5": "Partial", "10": "Present" },
    },
  );
  assert.deepEqual(
    request.criteria.find((c: any) => c.critical),
    criterionDisplay(
      baseline.criteria.find((c: any) => c.critical),
      baseline.id,
    ),
  );
  assert.equal(JSON.stringify(baseline), before);
  assert.equal(
    calls.some((c) => c.path === "/api/runs"),
    false,
  );
  await act(async () => button("Обзор").click());
  await settle();
  await act(async () => button(fixtures.conversation.conversation_id).click());
  await settle();
  await typeValue(select("Версия чек-листа"), created.id);
  await settle();
  await act(async () => button("Оценить этот диалог").click());
  assert.deepEqual(calls.find((c) => c.path === "/api/runs")!.body, {
    dataset_id: fixtures.conversation.dataset_id,
    conversation_ids: [fixtures.conversation.conversation_id],
    checklist_version_id: created.id,
  });
});

test("saved source metadata survives score and critical drift without refreshing copied judgments", async () => {
  const saved = structuredClone(fixtures.report);
  saved.spec.filters.min_score = 80;
  saved.spec.filters.critical = true;
  saved.stale = true;
  saved.output.spec = structuredClone(saved.spec);
  const observed = saved.output.observations[0];
  observed.final.critical_flag = true;
  const savedCritical = observed.final.criteria.find(
    (c: any) => c.criterion_id === "critical",
  );
  savedCritical.value = true;
  savedCritical.normalized_value = 1;
  saved.output.groups[0].metrics.critical.value = 100;
  observed.final.criteria.find(
    (c: any) => c.criterion_id === "dialogue",
  ).rationale = "Copied judgment retained after review";
  const current = structuredClone(fixtures.evaluation);
  const changedDialogue = current.final.criteria.find(
    (c: any) => c.criterion_id === "dialogue",
  );
  current.final.earned_points -= changedDialogue.points;
  Object.assign(changedDialogue, {
    value: 0,
    normalized_value: 0,
    points: 0,
    weighted_score: 0,
  });
  current.final.final_score =
    Math.round(
      (10000 * current.final.earned_points) / current.final.applicable_weight,
    ) / 100;
  current.final.critical_flag = false;
  const originalRoute = route;
  route = (path, body) => {
    if (path === `/api/reports/${saved.id}`) return saved;
    if (path === "/api/conversations/search")
      return body.min_score != null || body.critical != null
        ? { items: [], total: 0 }
        : fixtures.conversation_page;
    if (path.startsWith("/api/evaluations/")) return current;
    return originalRoute(path, body);
  };
  localStorage.setItem("cqa-report", saved.id);
  await act(async () => root.render(<App />));
  await settle();
  await act(async () => button("Ассистент и отчёты").click());
  await settle();
  const source = Array.from(
    container.querySelectorAll(".report-canvas .text-button"),
  ).find((b) => b.textContent === observed.conversation_id);
  assert.ok(source);
  const row = source.closest("tr")!;
  assert.match(
    row.querySelector(".source-tags")?.textContent || "",
    /ЧатАнглийский \(EN\)/,
  );
  assert.match(row.textContent || "", /2026/);
  assert.ok(row.textContent?.includes(score(observed.final.final_score)));
  assert.match(row.textContent || "", /Критическое нарушение/);
  assert.doesNotMatch(
    row.textContent || "",
    /Загрузка источника|Дата не назначена/,
  );
  const tile = Array.from(container.querySelectorAll(".metric-tile")).find(
    (b) => b.textContent?.includes("Ведение диалога"),
  ) as HTMLButtonElement;
  await act(async () => tile.click());
  const evidence = container.querySelector(
    "dialog .turn-link",
  ) as HTMLButtonElement;
  await act(async () => evidence.click());
  await settle();
  assert.match(
    container.querySelector("[aria-label='Сохранённая оценка отчёта']")
      ?.textContent || "",
    /Copied judgment retained after review/,
  );
  assert.equal(
    calls.some(
      (c) =>
        c.path.includes("/refresh") ||
        c.path === "/api/runs" ||
        c.path === "/api/assistant",
    ),
    false,
  );
});

test("JSON import previews and submits the existing atomic API without starting evaluation", async () => {
  const record = {
    conversation_id: "upload-001",
    channel: "agent chat",
    language: "EN",
    audio_url: null,
    transcript: [
      { timestamp: "00:01", speaker: "client", text: "Synthetic upload only" },
    ],
  };
  let opened = false;
  const originalRoute = route;
  route = (path, body) =>
    path === "/api/datasets/import"
      ? {
          dataset_id: body.group_id,
          total_records: 1,
          assign_demo_dates: false,
          scheduling_seed: null,
        }
      : originalRoute(path, body);
  await act(async () =>
    root.render(
      <DatasetImport
        close={() => {}}
        imported={async () => {
          opened = true;
        }}
      />,
    ),
  );
  await act(async () => button("Вставить JSON").click());
  const textarea = container.querySelector("textarea")!;
  await typeValue(textarea, JSON.stringify([record]));
  await act(async () => button("Предпросмотр диалогов").click());
  assert.match(
    container.querySelector("[aria-label='Предпросмотр импорта']")
      ?.textContent || "",
    /upload-001/,
  );
  assert.equal(calls.length, 0);
  await act(async () => button("Импортировать диалоги (1)").click());
  await settle();
  assert.deepEqual(calls, [
    {
      path: "/api/datasets/import",
      body: {
        group_id: "IMPORT",
        payload: {
          error: "",
          isSuccess: true,
          data: {
            dataset_group_id: "IMPORT",
            total_records: 1,
            records: [record],
          },
        },
        assign_demo_dates: false,
      },
    },
  ]);
  assert.match(container.textContent || "", /Диалоги импортированы/);
  await act(async () => button("Открыть набор данных").click());
  assert.equal(opened, true);
});

test("invalid pasted JSON stays actionable and sends no API requests", async () => {
  await act(async () =>
    root.render(<DatasetImport close={() => {}} imported={async () => {}} />),
  );
  await act(async () => button("Вставить JSON").click());
  await typeValue(container.querySelector("textarea")!, "{bad-json");
  await act(async () => button("Предпросмотр диалогов").click());
  assert.match(
    container.querySelector("[role='alert']")?.textContent || "",
    /Некорректный JSON/,
  );
  assert.equal(button("Импортировать диалоги").disabled, true);
  assert.equal(calls.length, 0);
});

test("refresh failure after import keeps the saved result and never repeats the import request", async () => {
  const record = {
    conversation_id: "refresh-check",
    channel: "agent chat",
    language: "RU",
    audio_url: null,
    transcript: [
      {
        timestamp: "00:01",
        speaker: "client",
        text: "Synthetic refresh check",
      },
    ],
  };
  let refreshes = 0;
  route = (path) => {
    assert.equal(path, "/api/datasets/import");
    return {
      dataset_id: "IMPORT",
      total_records: 1,
      assign_demo_dates: false,
      scheduling_seed: null,
    };
  };
  await act(async () =>
    root.render(
      <DatasetImport
        close={() => {}}
        imported={async () => {
          refreshes++;
          if (refreshes === 1) throw new Error("Offline");
        }}
      />,
    ),
  );
  await act(async () => button("Вставить JSON").click());
  await typeValue(container.querySelector("textarea")!, JSON.stringify(record));
  await act(async () => button("Предпросмотр диалогов").click());
  await act(async () => button("Импортировать диалоги (1)").click());
  await settle();
  await act(async () => button("Открыть набор данных").click());
  assert.match(
    container.querySelector("[role='alert']")?.textContent || "",
    /Импорт выполнен/,
  );
  assert.match(container.textContent || "", /Диалоги импортированы/);
  await act(async () => button("Открыть набор данных").click());
  assert.equal(refreshes, 2);
  assert.equal(
    calls.filter((c) => c.path === "/api/datasets/import").length,
    1,
  );
});

test("settings load server RU, save exact EN preference and reload EN without model work", async () => {
  let serverLanguage = "RU";
  let finishSave!: () => void;
  const saving = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  const methods: string[] = [];
  const originalFetch = fetch;
  globalThis.fetch = async (input, init) => {
    methods.push(init?.method || "GET");
    return originalFetch(input, init);
  };
  route = async (path, body) => {
    assert.equal(path, "/api/settings");
    if (body) {
      await saving;
      serverLanguage = body.analysis_language;
    }
    return { analysis_language: serverLanguage };
  };
  await act(async () => root.render(<Settings />));
  await settle();
  assert.equal(select("Язык анализа").value, "RU");
  assert.match(container.textContent || "", /Русский \(RU\)/);
  assert.match(container.textContent || "", /не запускает работу модели/);
  await typeValue(select("Язык анализа"), "EN");
  assert.equal(
    calls.length,
    1,
    "Changing the draft preference sends no request",
  );
  await act(async () => button("Сохранить настройки").click());
  assert.equal(button("Сохранение…").disabled, true);
  assert.equal(select("Язык анализа").disabled, true);
  assert.equal(container.querySelector("[role='status']"), null);
  await act(async () => finishSave());
  await settle();
  assert.match(
    container.querySelector("[role='status']")?.textContent || "",
    /Настройки сохранены.*Английский \(EN\)/,
  );
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<Settings />));
  await settle();
  assert.equal(select("Язык анализа").value, "EN");
  assert.deepEqual(calls, [
    { path: "/api/settings", body: undefined },
    { path: "/api/settings", body: { analysis_language: "EN" } },
    { path: "/api/settings", body: undefined },
  ]);
  assert.deepEqual(methods, ["GET", "POST", "GET"]);
});

test("analysis preference remains independent from source-language filters", async () => {
  let serverLanguage = "EN";
  const originalRoute = route;
  route = (path, body) => {
    if (path === "/api/settings") {
      if (body) serverLanguage = body.analysis_language;
      return { analysis_language: serverLanguage };
    }
    return originalRoute(path, body);
  };
  await act(async () => root.render(<App />));
  await settle();
  await typeValue(select("Язык диалога"), "RU");
  await settle();
  await act(async () => button("Настройки").click());
  await settle();
  assert.equal(select("Язык анализа").value, "EN");
  const before = calls.length;
  await typeValue(select("Язык анализа"), "KZ");
  await act(async () => button("Сохранить настройки").click());
  await settle();
  assert.deepEqual(calls.slice(before), [
    { path: "/api/settings", body: { analysis_language: "KZ" } },
  ]);
  await act(async () => button("Обзор").click());
  await settle();
  assert.equal(select("Язык диалога").value, "RU");
  assert.match(
    container.querySelector(".chips")?.textContent || "",
    /Русский \(RU\)/,
  );
  assert.equal(
    calls.some(
      (call) => call.path === "/api/runs" || call.path === "/api/assistant",
    ),
    false,
  );
});

test("settings save failure remains visible and never claims saved success", async () => {
  route = (path, body) => {
    assert.equal(path, "/api/settings");
    return body
      ? new Response(
          JSON.stringify({ detail: "Synthetic storage unavailable" }),
          { status: 503 },
        )
      : { analysis_language: "RU" };
  };
  await act(async () => root.render(<Settings />));
  await settle();
  await typeValue(select("Язык анализа"), "EN");
  await act(async () => button("Сохранить настройки").click());
  await settle();
  assert.match(
    container.querySelector("[role='alert']")?.textContent || "",
    /Synthetic storage unavailable/,
  );
  assert.equal(container.querySelector("[role='status']"), null);
  assert.equal(
    select("Язык анализа").value,
    "EN",
    "The unsaved choice remains editable",
  );
  assert.equal(button("Сохранить настройки").disabled, false);
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<Settings />));
  await settle();
  assert.equal(
    select("Язык анализа").value,
    "RU",
    "Failed save does not change server preference",
  );
  assert.equal(
    calls.some((call) => call.path !== "/api/settings"),
    false,
  );
});

test("settings show loading and actionable read failure before a successful retry", async () => {
  let finishRead!: () => void;
  const loading = new Promise<void>((resolve) => {
    finishRead = resolve;
  });
  let attempts = 0;
  route = async (path) => {
    assert.equal(path, "/api/settings");
    if (attempts++ === 0) {
      await loading;
      return new Response(
        JSON.stringify({ detail: "Synthetic read failure" }),
        { status: 500 },
      );
    }
    return { analysis_language: "RU" };
  };
  await act(async () => root.render(<Settings />));
  assert.match(container.textContent || "", /Загрузка настроек/);
  await act(async () => finishRead());
  await settle();
  assert.match(
    container.querySelector("[role='alert']")?.textContent || "",
    /Synthetic read failure/,
  );
  assert.equal(button("Сохранить настройки").disabled, true);
  assert.equal(container.querySelector("[role='status']"), null);
  await act(async () => button("Повторить загрузку настроек").click());
  await settle();
  assert.equal(select("Язык анализа").value, "RU");
  assert.equal(container.querySelector("[role='alert']"), null);
  assert.equal(calls.length, 2);
});

test("legacy EN and new RU analysis provenance is honest while source turns stay unchanged", async () => {
  const originalRoute = route;
  let language: "EN" | "RU" | undefined;
  route = (path, body) =>
    path.startsWith("/api/evaluations/")
      ? { ...fixtures.evaluation, analysis_language: language }
      : originalRoute(path, body);
  const draw = () => (
    <ConversationDrawer
      id="fictional-001"
      dataset="FICTIONAL"
      metric="dialogue"
      checklists={[fixtures.checklist]}
      close={() => {}}
      changed={() => {}}
    />
  );
  await act(async () => root.render(draw()));
  await settle();
  assert.match(
    container.querySelector(".assessment-identity")?.textContent || "",
    /Язык анализа: Английский \(EN\)/,
  );
  assert.deepEqual(
    Array.from(
      container.querySelectorAll(".turns li p"),
      (node) => node.textContent,
    ),
    fixtures.conversation.transcript.map((turn: { text: string }) => turn.text),
  );
  await act(async () => root.unmount());
  root = createRoot(container);
  language = "RU";
  await act(async () => root.render(draw()));
  await settle();
  assert.match(
    container.querySelector(".assessment-identity")?.textContent || "",
    /Язык анализа: Русский \(RU\)/,
  );
  assert.equal(
    calls.some(
      (call) => call.path === "/api/runs" || call.path === "/api/assistant",
    ),
    false,
  );
});
