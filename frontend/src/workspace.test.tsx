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
  await act(async () => button("Checklists").click());
  await settle();
  const originalRows = container.querySelectorAll(".criterion-editor").length;
  await act(async () => button("Add criterion").click());
  const rows = container.querySelectorAll(".criterion-editor");
  assert.equal(rows.length, originalRows + 1);
  const added = rows[rows.length - 1];
  const identity = field(added, "Criterion ID") as HTMLInputElement;
  assert.equal(identity.disabled, false);
  assert.equal(
    new RegExp(identity.pattern, "v").test("replacement-metric"),
    true,
  );
  identity.focus();
  await typeValue(identity, "replacement_a");
  assert.equal(
    field(added, "Criterion ID"),
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
    (b) => b.textContent?.trim() === "Remove criterion",
  );
  assert.ok(remove);
  await act(async () => remove.click());
  assert.equal(
    container.querySelectorAll(".criterion-editor").length,
    originalRows,
  );
  assert.equal(field(added, "Criterion ID"), identity);
  await typeValue(field(added, "Title"), "Synthetic replacement");
  await typeValue(
    field(added, "Criterion wording"),
    "Assess the stated fictional property.",
  );
  await typeValue(field(added, "Answer type"), "scale");
  await typeValue(field(added, "Weight"), "7");
  await typeValue(field(added, "Allowed raw steps"), "0, 5, 10");
  await act(async () =>
    (field(added, "Allow N/A") as HTMLInputElement).click(),
  );
  await typeValue(
    field(added, "N/A condition"),
    "The fictional property is not observable.",
  );
  for (const [value, meaning] of [
    ["0", "Absent"],
    ["5", "Partial"],
    ["10", "Present"],
  ])
    await typeValue(field(added, `Meaning of ${value}`), meaning);
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
    /Criterion IDs must start with a lowercase letter/,
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
  assert.match(container.textContent || "", /Criterion IDs must be unique/);
  assert.equal(
    calls.some((c) => c.path === "/api/checklists" && c.body),
    false,
  );
  await typeValue(identity, "replacement_metric");
  await act(async () => button("Add criterion").click());
  const additional = Array.from(
    container.querySelectorAll(".criterion-editor"),
  ).at(-1)!;
  await typeValue(field(additional, "Criterion ID"), "additional_metric");
  await typeValue(field(additional, "Title"), "Additional fictional check");
  await typeValue(
    field(additional, "Criterion wording"),
    "Assess another stated fictional property.",
  );
  await typeValue(field(additional, "Weight"), "3");
  await act(async () => button("Save new checklist version").click());
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
    baseline.criteria.find((c: any) => c.critical),
  );
  assert.equal(JSON.stringify(baseline), before);
  assert.equal(
    calls.some((c) => c.path === "/api/runs"),
    false,
  );
  await act(async () => button("Overview").click());
  await settle();
  await act(async () => button(fixtures.conversation.conversation_id).click());
  await settle();
  await typeValue(select("Checklist version"), created.id);
  await settle();
  await act(async () => button("Evaluate this conversation").click());
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
  await act(async () => button("Assistant & reports").click());
  await settle();
  const source = Array.from(
    container.querySelectorAll(".report-canvas .text-button"),
  ).find((b) => b.textContent === observed.conversation_id);
  assert.ok(source);
  const row = source.closest("tr")!;
  assert.match(row.textContent || "", /agent chat \/ EN/);
  assert.match(row.textContent || "", /2026/);
  assert.ok(row.textContent?.includes(observed.final.final_score.toFixed(2)));
  assert.match(row.textContent || "", /Critical flag/);
  assert.doesNotMatch(row.textContent || "", /Source loading|No assigned date/);
  const tile = Array.from(container.querySelectorAll(".metric-tile")).find(
    (b) => b.textContent?.includes("Dialogue"),
  ) as HTMLButtonElement;
  await act(async () => tile.click());
  const evidence = container.querySelector(
    "dialog .turn-link",
  ) as HTMLButtonElement;
  await act(async () => evidence.click());
  await settle();
  assert.match(
    container.querySelector("[aria-label='Saved report observation']")
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
