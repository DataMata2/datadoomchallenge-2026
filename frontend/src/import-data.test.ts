import test from "node:test";
import assert from "node:assert/strict";
import { prepareImport } from "./import-data";

const record = {
  conversation_id: "upload-001",
  channel: "agent chat",
  language: "KZ",
  audio_url: null,
  transcript: [
    {
      timestamp: "00:01",
      speaker: "operator",
      text: "Сәлеметсіз бе! <script>untrusted source</script>",
    },
  ],
};
test("import preserves original source data for envelope, array and single-record formats", () => {
  const envelope = {
    error: "",
    isSuccess: true,
    data: { dataset_group_id: "CONTROL", total_records: 1, records: [record] },
  };
  assert.equal(prepareImport(envelope, "IGNORED"), envelope);
  assert.deepEqual(prepareImport([record], "UPLOAD").data.records, [record]);
  assert.deepEqual(prepareImport(record, "UPLOAD").data.records, [record]);
  assert.equal(prepareImport(record, "UPLOAD").data.dataset_group_id, "UPLOAD");
});
test("invalid counts, duplicate IDs and malformed turns never pass the import preview", () => {
  assert.throws(() => prepareImport([record, record], "UPLOAD"), /Duplicate/);
  assert.throws(
    () =>
      prepareImport(
        {
          error: "",
          isSuccess: true,
          data: {
            dataset_group_id: "DEV",
            total_records: 2,
            records: [record],
          },
        },
        "DEV",
      ),
    /count/,
  );
  assert.throws(
    () =>
      prepareImport(
        {
          ...record,
          transcript: [{ timestamp: "00:01", speaker: "agent", text: "Hello" }],
        },
        "UPLOAD",
      ),
    /each turn/,
  );
  assert.throws(
    () =>
      prepareImport({ error: "failure", isSuccess: false, data: {} }, "DEV"),
    /successful/,
  );
  assert.throws(() => prepareImport([], "DEV"), /no conversations/);
});
