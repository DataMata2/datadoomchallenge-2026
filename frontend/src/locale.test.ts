import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { criterionDisplay, groupLabel, label, metadataText } from "./locale";
import { score, time } from "./ui";
const fixtures = JSON.parse(
  readFileSync(
    new URL("../../docs/api-examples.json", import.meta.url),
    "utf8",
  ),
).implemented;

test("canonical display copies localize built-in wording without mutating source or custom criteria", () => {
  const checklist = structuredClone(fixtures.checklist);
  const before = JSON.stringify(checklist);
  const source = checklist.criteria.find(
    (criterion: { id: string }) => criterion.id === "dialogue",
  );
  const display = criterionDisplay(source, "cqa-v1");
  assert.match(display.title, /Ясность/);
  assert.match(display.description, /Оцените ясность/);
  assert.match(display.scale_meanings?.["10"] || "", /Ответы ясные/);
  assert.equal(JSON.stringify(checklist), before);
  assert.equal(criterionDisplay(source, "user-defined-version"), source);
});

test("known metadata is localized while unknown data and user cohort labels remain inspectable", () => {
  assert.equal(label("cancelled"), "Отменено");
  assert.equal(label("new-unrecognized-state"), "new-unrecognized-state");
  assert.equal(groupLabel("Day 06:00–18:00"), "День 06:00–18:00");
  assert.equal(
    groupLabel("All selected", true),
    "All selected",
    "User-entered cohort labels are verbatim",
  );
  assert.equal(
    groupLabel("2026-10 days 16–end"),
    "2026-10: 16 число — конец месяца",
  );
  assert.equal(
    metadataText('Global filters: {"language": "RU"}'),
    'Общие фильтры: {"language": "RU"}',
  );
  assert.match(
    metadataText(
      "Latest cqa-v1 evaluation including errors; means exclude failed, unevaluated and N/A values.",
    ),
    /Используется последняя оценка/,
  );
  assert.equal(
    metadataText("Unrecognized original metadata"),
    "Unrecognized original metadata",
  );
  assert.equal(score(92.31), "92,31");
  assert.match(time("2026-10-01T00:00:00Z"), /05:00/);
});
