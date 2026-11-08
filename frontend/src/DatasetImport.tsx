import { useRef, useState } from "react";
import { api, type DatasetImportResult, type SourceEnvelope } from "./api";
import { prepareImport } from "./import-data";
import { Dialog, ErrorBox, errorText } from "./ui";
import Icon from "./Icon";
import { languageName } from "./locale";

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
          ? "Некорректный JSON. Проверьте файл или вставленный текст и повторите попытку."
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
      setError("Выберите файл JSON размером до 20 МБ.");
      return;
    }
    try {
      const source = await file.text();
      if (current === selection.current) preview(source, file.name);
    } catch {
      if (current === selection.current)
        setError("Не удалось прочитать файл. Выберите его повторно.");
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
        `Импорт выполнен. Не удалось обновить рабочую область: ${errorText(e)}. Попробуйте снова открыть набор данных.`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Импортировать диалоги" close={close} busy={busy}>
      <div className="import-body">
        {result ? (
          <div className="import-success" role="status">
            <span className="success-orbit">
              <Icon name="check" size={32} />
            </span>
            <span className="eyebrow">ГОТОВО К ПРОВЕРКЕ</span>
            <h3>Диалоги импортированы.</h3>
            <p>
              {result.total_records} диалогов доступны в наборе{" "}
              <strong>{result.dataset_id}</strong>. Импорт сохраняет
              существующие оценки и не запускает оценку моделью.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void openDataset()}
            >
              {busy ? "Открытие набора…" : "Открыть набор данных"}
              <Icon name="arrow" size={16} />
            </button>
          </div>
        ) : (
          <>
            <p className="import-intro">
              Соберите диалоги в одной рабочей области. Проверьте данные перед
              импортом.
            </p>
            <div className="segmented" role="group" aria-label="Способ импорта">
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
                Загрузить файл
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
                Вставить JSON
              </button>
            </div>
            {!payload && (
              <label>
                Идентификатор набора для одного диалога или массива
                <input
                  value={group}
                  maxLength={128}
                  disabled={busy}
                  onChange={(e) => setGroup(e.target.value)}
                />
                <small>
                  В ответе организаторов используется идентификатор набора из
                  файла.
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
                    setError("Перетаскивайте по одному файлу JSON.");
                    return;
                  }
                  void readFile(e.dataTransfer.files[0]);
                }}
              >
                <span className="upload-orbit">
                  <Icon name="upload" size={25} />
                </span>
                <strong>
                  {payload ? filename : "Перетащите файл JSON сюда"}
                </strong>
                <span>
                  Ответ организаторов, массив диалогов или один диалог · до 20
                  МБ
                </span>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".json,application/json"
                  aria-label="Файл JSON с диалогами"
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
                  {payload ? "Выбрать другой файл" : "Выбрать файл"}
                </button>
              </div>
            ) : (
              <div className="paste-input">
                <label>
                  JSON диалогов
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
                  onClick={() => preview(text, "Вставленный JSON")}
                >
                  Предпросмотр диалогов
                </button>
              </div>
            )}
            {payload && (
              <section
                className="import-preview"
                aria-label="Предпросмотр импорта"
              >
                <div className="row">
                  <Icon name="file" />
                  <strong>{payload.data.dataset_group_id}</strong>
                  <span className="status ok">Готово к импорту</span>
                </div>
                <div className="import-counts">
                  <div>
                    <strong>{records.length}</strong>
                    <small>диалогов</small>
                  </div>
                  <div>
                    <strong>
                      {records.filter((r) => r.channel === "agent chat").length}
                    </strong>
                    <small>чатов</small>
                  </div>
                  <div>
                    <strong>
                      {records.filter((r) => r.channel === "voice call").length}
                    </strong>
                    <small>звонков</small>
                  </div>
                  <div>
                    <strong>
                      {[
                        ...new Set(
                          records.map((r) => languageName(r.language)),
                        ),
                      ].join(" · ")}
                    </strong>
                    <small>языки</small>
                  </div>
                </div>
                <div className="preview-records">
                  {records.slice(0, 3).map((r) => (
                    <div key={r.conversation_id}>
                      <span>{r.conversation_id}</span>
                      <small>
                        {languageName(r.language)} · {r.transcript.length}{" "}
                        реплик
                      </small>
                    </div>
                  ))}
                  {records.length > 3 && (
                    <small>и ещё {records.length - 3} диалогов</small>
                  )}
                </div>
                <label className="inline-label">
                  <input
                    type="checkbox"
                    checked={demoDates}
                    disabled={busy}
                    onChange={(e) => setDemoDates(e.target.checked)}
                  />
                  Назначить демонстрационные даты в октябре 2026 года
                </label>
                <small>
                  Исходные временные метки сохранены. Демонстрационные даты
                  используются только для календарных сравнений.
                </small>
              </section>
            )}
            <details className="format-help">
              <summary>Какие форматы JSON поддерживаются?</summary>
              <p>
                Используйте ответ API организаторов, массив записей или одну
                запись. Диалог должен содержать conversation_id, channel,
                language, transcript и audio_url. Реплика должна содержать
                timestamp, speaker и text. Для чатов укажите audio_url: null.
              </p>
            </details>
            <div className="import-actions">
              <span>
                <Icon name="shield" size={15} /> Только импорт · без запроса к
                модели
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
                  ? "Импорт…"
                  : `Импортировать диалоги${payload ? ` (${records.length})` : ""}`}
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
