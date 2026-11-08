import { message, t, count } from "./i18n";
import { useRef, useState } from "react";
import { api, type DatasetImportResult, type SourceEnvelope } from "./api";
import { prepareImport } from "./import-data";
import { Dialog, ErrorBox, errorText } from "./ui";
import Icon from "./Icon";

export default function DatasetImport({
  close,
  imported,
}: {
  close: () => void;
  imported: (result: DatasetImportResult) => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [group, setGroup] = useState("IMPORT");
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const [payload, setPayload] = useState<SourceEnvelope>();
  const [demoDates, setDemoDates] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DatasetImportResult>();
  const selection = useRef(0);
  const preview = (source: string, label: string) => {
    setPayload(undefined);
    setError("");
    try {
      const parsed = prepareImport(
        JSON.parse(source.replace(/^\uFEFF/, "")),
        group,
      );
      setPayload(parsed);
      setFilename(label);
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "This is not valid JSON. Check the file or pasted text and try again."
          : errorText(e),
      );
    }
  };
  const readFile = async (file?: File) => {
    if (!file || busy) return;
    const current = ++selection.current;
    setError("");
    setPayload(undefined);
    if (file.size > 20 * 1024 * 1024) {
      setError("Choose a JSON file smaller than 20 MB.");
      return;
    }
    try {
      const source = await file.text();
      if (current === selection.current) preview(source, file.name);
    } catch {
      if (current === selection.current)
        setError("The file could not be read. Select it again.");
    }
  };
  const records = payload?.data.records || [];
  const openDataset = async () => {
    if (!result) return;
    setBusy(true);
    setError("");
    try {
      await imported(result);
    } catch (e) {
      setError(
        `Import succeeded. Could not refresh the workspace: ${errorText(e)}. Try opening the dataset again.`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={t("Import conversations")} close={close} busy={busy}>
      <div className="import-body">
        {result ? (
          <div className="import-success" role="status">
            <span className="success-orbit">
              <Icon name="check" size={32} />
            </span>
            <span className="eyebrow">{t("READY FOR REVIEW")}</span>
            <h3>{t("Your conversations are in.")}</h3>
            <p>
              {t("Dataset {dataset} now contains {count}.", {
                dataset: result.dataset_id,
                count: count("conversations", result.total_records),
              })}{" "}
              {t(
                "Importing keeps existing assessments and does not start a model evaluation.",
              )}
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void openDataset()}
            >
              {busy ? t("Opening dataset…") : t("Open dataset")}
              <Icon name="arrow" size={16} />
            </button>
          </div>
        ) : (
          <>
            <p className="import-intro">
              {t(
                "Bring your conversations into one workspace. Preview the data before you import.",
              )}
            </p>
            <div
              className="segmented"
              role="group"
              aria-label={t("Import method")}
            >
              <button
                className={mode === "file" ? "selected" : ""}
                aria-pressed={mode === "file"}
                disabled={busy}
                onClick={() => {
                  selection.current++;
                  setMode("file");
                  setPayload(undefined);
                  setError("");
                }}
              >
                {t("Upload file")}
              </button>
              <button
                className={mode === "paste" ? "selected" : ""}
                aria-pressed={mode === "paste"}
                disabled={busy}
                onClick={() => {
                  selection.current++;
                  setMode("paste");
                  setPayload(undefined);
                  setError("");
                }}
              >
                {t("Paste JSON")}
              </button>
            </div>
            {!payload && (
              <label>
                {t("Dataset ID for a single conversation or array")}
                <input
                  value={group}
                  maxLength={128}
                  disabled={busy}
                  onChange={(e) => setGroup(e.target.value)}
                />
                <small>
                  {t(
                    "Organizer responses use the dataset ID already in the file.",
                  )}
                </small>
              </label>
            )}
            {mode === "file" ? (
              <div
                className={`dropzone ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (busy) return;
                  if (e.dataTransfer.files.length !== 1) {
                    setError("Drop one JSON file at a time.");
                    return;
                  }
                  void readFile(e.dataTransfer.files[0]);
                }}
              >
                <span className="upload-orbit">
                  <Icon name="upload" size={25} />
                </span>
                <strong>
                  {payload ? filename : t("Drop your JSON file here")}
                </strong>
                <span>
                  {t(
                    "Organizer response, conversation array or single conversation · up to 20 MB",
                  )}
                </span>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".json,application/json"
                  aria-label={t("Conversation JSON file")}
                  disabled={busy}
                  onChange={(e) => {
                    void readFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  {payload ? t("Choose another file") : t("Browse files")}
                </button>
              </div>
            ) : (
              <div className="paste-input">
                <label>
                  {t("Conversation JSON")}
                  <textarea
                    value={text}
                    disabled={busy}
                    spellCheck={false}
                    onChange={(e) => {
                      setText(e.target.value);
                      setPayload(undefined);
                      setError("");
                    }}
                    placeholder='{"error":"","isSuccess":true,"data":{"dataset_group_id":"DEV",…}}'
                  />
                </label>
                <button
                  disabled={busy || !text.trim()}
                  onClick={() => preview(text, "Pasted JSON")}
                >
                  {t("Preview conversations")}
                </button>
              </div>
            )}
            {payload && (
              <section
                className="import-preview"
                aria-label={t("Import preview")}
              >
                <div className="row">
                  <Icon name="file" />
                  <strong>{payload.data.dataset_group_id}</strong>
                  <span className="status ok">{t("Ready to import")}</span>
                </div>
                <div className="import-counts">
                  <div>
                    <strong>{records.length}</strong>
                    <small>{t("conversations")}</small>
                  </div>
                  <div>
                    <strong>
                      {records.filter((r) => r.channel === "agent chat").length}
                    </strong>
                    <small>{t("chats")}</small>
                  </div>
                  <div>
                    <strong>
                      {records.filter((r) => r.channel === "voice call").length}
                    </strong>
                    <small>{t("calls")}</small>
                  </div>
                  <div>
                    <strong>
                      {[...new Set(records.map((r) => r.language))].join(" · ")}
                    </strong>
                    <small>{t("languages")}</small>
                  </div>
                </div>
                <div className="preview-records">
                  {records.slice(0, 3).map((r) => (
                    <div key={r.conversation_id}>
                      <span>{r.conversation_id}</span>
                      <small>
                        {r.language} · {count("turns", r.transcript.length)}
                      </small>
                    </div>
                  ))}
                  {records.length > 3 && (
                    <small>
                      {t(" and ")}
                      {records.length - 3} {t(" more conversations")}
                    </small>
                  )}
                </div>
                <label className="inline-label">
                  <input
                    type="checkbox"
                    checked={demoDates}
                    disabled={busy}
                    onChange={(e) => setDemoDates(e.target.checked)}
                  />
                  {t("Add demonstration dates in October 2026")}
                </label>
                <small>
                  {t(
                    "Original transcript timestamps are preserved. Demo dates only enable calendar comparisons.",
                  )}
                </small>
              </section>
            )}
            <details className="format-help">
              <summary>{t("Which JSON formats are supported?")}</summary>
              <p>
                {t(
                  "Use the organizer API response, an array of records, or one record. Each conversation needs conversation_id, channel, language, transcript and audio_url. Each turn needs timestamp, speaker and text. Use audio_url: null for chats.",
                )}
              </p>
            </details>
            <div className="import-actions">
              <span>
                <Icon name="shield" size={15} />{" "}
                {t(" Import only · no model request")}
              </span>
              <button
                className="primary"
                disabled={busy || !payload}
                onClick={async () => {
                  if (!payload) return;
                  setBusy(true);
                  setError("");
                  try {
                    setResult(
                      await api.importDataset({
                        group_id: payload.data.dataset_group_id,
                        payload,
                        assign_demo_dates: demoDates,
                      }),
                    );
                  } catch (e) {
                    setError(errorText(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? t("Importing…")
                  : payload
                    ? t("Import {count}", {
                        count: count("conversations", records.length),
                      })
                    : t("Import conversations")}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </>
        )}
        {error && <ErrorBox>{message(error)}</ErrorBox>}
      </div>
    </Dialog>
  );
}
