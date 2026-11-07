import test from "node:test";
import assert from "node:assert/strict";
import { activeRun, calendarBounds, raw } from "./domain.ts";
test("cancelled paid work remains observable until the backend records completion", () => {
  assert.equal(activeRun({ status: "cancelled", finished_at: null }), true);
  assert.equal(
    activeRun({ status: "cancelled", finished_at: "2026-11-07T21:00:00Z" }),
    false,
  );
  assert.equal(activeRun({ status: "running", finished_at: null }), true);
  assert.equal(activeRun({ status: "interrupted", finished_at: null }), false);
});
test("unknown, N/A, false and zero retain separate display meanings", () => {
  assert.deepEqual(
    [raw(undefined), raw(null), raw(false), raw(0), raw(true)],
    ["Unknown", "N/A", "No", "0", "Yes"],
  );
});
test("inclusive user dates become exclusive backend bounds across month/year boundaries", () => {
  assert.deepEqual(calendarBounds("2026-10-01", "2026-10-31"), {
    start_at: "2026-10-01T00:00:00+05:00",
    end_at: "2026-11-01T00:00:00+05:00",
  });
  assert.equal(
    calendarBounds("2026-12-01", "2026-12-31").end_at,
    "2027-01-01T00:00:00+05:00",
  );
  assert.equal(
    calendarBounds("2028-02-01", "2028-02-29").end_at,
    "2028-03-01T00:00:00+05:00",
  );
  assert.deepEqual(calendarBounds("", ""), { start_at: null, end_at: null });
});
