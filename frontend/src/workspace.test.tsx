/** Synthetic contract/component tests. No browser, provider, or runtime DB is used. */
import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "./App";
import Analysis from "./Analysis";
import ConversationDrawer from "./ConversationDrawer";
import ReportWorkspace from "./ReportWorkspace";
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
beforeEach(() => {
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
  container = document.getElementById("root") as HTMLDivElement;
  root = createRoot(container);
  calls = [];
  route = (path, body) => {
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
    return new Response(JSON.stringify(route(path, body)), {
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
    select("Language").value = "RU";
    select("Language").dispatchEvent(
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
  assert.match(dialog.textContent || "", /eligible conversations/);
  assert.match(dialog.textContent || "", /N\/A/);
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
  assert.match(container.textContent || "", /Raw value/);
  assert.match(container.textContent || "", /Weighted contribution/);
  assert.match(container.textContent || "", /Original transcript/);
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
  assert.match(container.textContent || "", /This report is a draft/);
  assert.equal(
    Array.from(container.querySelectorAll("button")).some(
      (b) => b.textContent === "Define custom metric",
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
  assert.match(container.textContent || "", /1 applicable \/ 2 selected/);
  const metric = container.querySelector(".custom-metric") as HTMLButtonElement;
  await act(async () => metric.click());
  assert.match(
    container.querySelector("dialog")?.textContent || "",
    /1 uncovered/,
  );
  assert.match(
    container.querySelector("dialog")?.textContent || "",
    new RegExp(`Source turn #${result.judgment.evidence_turns[0]}`),
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
  assert.match(container.textContent || "", /Source assessments have changed/);
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
    select("Compare by").value = "month_half";
    select("Compare by").dispatchEvent(
      new dom.window.Event("change", { bubbles: true }),
    );
  });
  await settle();
  await act(async () => button("Save selection as report").click());
  await settle();
  assert.ok(saved, "The overview selection was saved");
  assert.equal(select("Saved report").value, "new-saved-report");
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
    select("Saved report").value = fixtures.report.id;
    select("Saved report").dispatchEvent(
      new dom.window.Event("change", { bubbles: true }),
    );
  });
  await settle();
  await act(async () => {
    select("Saved report").value = saved.id;
    select("Saved report").dispatchEvent(
      new dom.window.Event("change", { bubbles: true }),
    );
  });
  await settle();
  assert.equal(select("Saved report").value, saved.id);
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
  await act(async () => button("Assistant & reports").click());
  await settle();
  assert.equal(select("Saved report").value, "new-saved-report");
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
  await act(async () => button("Assistant & reports").click());
  await settle();
  const tile = Array.from(container.querySelectorAll(".metric-tile")).find(
    (b) => b.textContent?.includes("Dialogue"),
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
    "[aria-label='Saved report observation']",
  );
  assert.ok(snapshot);
  assert.match(
    snapshot.textContent || "",
    /Copied report rationale before review/,
  );
  assert.match(snapshot.textContent || "", /saved-revision-before-review/);
  assert.ok(snapshot.textContent?.includes(saved.output.generated_at));
  assert.match(snapshot.textContent || "", new RegExp(fixtures.evaluation.id));
  assert.match(
    container.textContent || "",
    /Current values differ from saved report values/,
  );
  assert.match(container.textContent || "", /Current reviewer rationale/);
  assert.equal(
    calls.some((c) => c.path.includes("/refresh") || c.path === "/api/runs"),
    false,
  );
});
