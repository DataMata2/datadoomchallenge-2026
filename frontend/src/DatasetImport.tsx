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
    <Dialog title="Import conversations" close={close} busy={busy}>
      <div className="import-body">
        {result ? (
          <div className="import-success" role="status">
            <span className="success-orbit">
              <Icon name="check" size={32} />
            </span>
            <span className="eyebrow">READY FOR REVIEW</span>
            <h3>Your conversations are in.</h3>
            <p>
              {result.total_records} conversations are available in{" "}
              <strong>{result.dataset_id}</strong>. Importing keeps existing
              assessments and does not start a model evaluation.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void openDataset()}
            >
              {busy ? "Opening dataset…" : "Open dataset"}
              <Icon name="arrow" size={16} />
            </button>
          </div>
        ) : (
          <>
            <p className="import-intro">
              Bring your conversations into one workspace. Preview the data
              before you import.
            </p>
            <div className="segmented" role="group" aria-label="Import method">
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
                Upload file
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
                Paste JSON
              </button>
            </div>
            {!payload && (
              <label>
                Dataset ID for a single conversation or array
                <input
                  value={group}
                  maxLength={128}
                  disabled={busy}
                  onChange={(e) => setGroup(e.target.value)}
                />
                <small>
                  Organizer responses use the dataset ID already in the file.
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
                  {payload ? filename : "Drop your JSON file here"}
                </strong>
                <span>
                  Organizer response, conversation array or single conversation
                  · up to 20 MB
                </span>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".json,application/json"
                  aria-label="Conversation JSON file"
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
                  {payload ? "Choose another file" : "Browse files"}
                </button>
              </div>
            ) : (
              <div className="paste-input">
                <label>
                  Conversation JSON
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
                  Preview conversations
                </button>
              </div>
            )}
            {payload && (
              <section className="import-preview" aria-label="Import preview">
                <div className="row">
                  <Icon name="file" />
                  <strong>{payload.data.dataset_group_id}</strong>
                  <span className="status ok">Ready to import</span>
                </div>
                <div className="import-counts">
                  <div>
                    <strong>{records.length}</strong>
                    <small>conversations</small>
                  </div>
                  <div>
                    <strong>
                      {records.filter((r) => r.channel === "agent chat").length}
                    </strong>
                    <small>chats</small>
                  </div>
                  <div>
                    <strong>
                      {records.filter((r) => r.channel === "voice call").length}
                    </strong>
                    <small>calls</small>
                  </div>
                  <div>
                    <strong>
                      {[...new Set(records.map((r) => r.language))].join(" · ")}
                    </strong>
                    <small>languages</small>
                  </div>
                </div>
                <div className="preview-records">
                  {records.slice(0, 3).map((r) => (
                    <div key={r.conversation_id}>
                      <span>{r.conversation_id}</span>
                      <small>
                        {r.language} · {r.transcript.length} turns
                      </small>
                    </div>
                  ))}
                  {records.length > 3 && (
                    <small>and {records.length - 3} more conversations</small>
                  )}
                </div>
                <label className="inline-label">
                  <input
                    type="checkbox"
                    checked={demoDates}
                    disabled={busy}
                    onChange={(e) => setDemoDates(e.target.checked)}
                  />
                  Add demonstration dates in October 2026
                </label>
                <small>
                  Original transcript timestamps are preserved. Demo dates only
                  enable calendar comparisons.
                </small>
              </section>
            )}
            <details className="format-help">
              <summary>Which JSON formats are supported?</summary>
              <p>
                Use the organizer API response, an array of records, or one
                record. Each conversation needs conversation_id, channel,
                language, transcript and audio_url. Each turn needs timestamp,
                speaker and text. Use audio_url: null for chats.
              </p>
            </details>
            <div className="import-actions">
              <span>
                <Icon name="shield" size={15} /> Import only · no model request
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
                  ? "Importing…"
                  : `Import${payload ? ` ${records.length}` : ""} conversations`}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Dialog>
  );
}
