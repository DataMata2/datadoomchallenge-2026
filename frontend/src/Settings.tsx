import { useEffect, useState } from "react";
import { api, type WorkspaceSettings } from "./api";
import { languageNames } from "./locale";
import { Empty, ErrorBox, errorText } from "./ui";

type Language = NonNullable<WorkspaceSettings["analysis_language"]>;
export default function Settings() {
  const [language, setLanguage] = useState<Language>("RU");
  const [saved, setSaved] = useState<Language>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api
      .settings()
      .then((settings) => {
        if (alive) {
          const value = settings.analysis_language || "RU";
          setLanguage(value);
          setSaved(value);
        }
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [revision]);
  return (
    <section
      className="panel settings-panel"
      aria-labelledby="settings-heading"
    >
      <div className="section-head">
        <div>
          <h2 id="settings-heading">Настройки анализа</h2>
          <p>Выберите язык новых оценок и ответов ассистента.</p>
        </div>
      </div>
      {loading ? (
        <Empty>Загрузка настроек…</Empty>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setSuccess(false);
            setError("");
            try {
              const result = await api.saveSettings({
                analysis_language: language,
              });
              const value = result.analysis_language || "RU";
              setSaved(value);
              setLanguage(value);
              setSuccess(true);
            } catch (e) {
              setError(errorText(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            Язык анализа
            <select
              value={language}
              disabled={saving || !saved}
              onChange={(event) => {
                setLanguage(event.target.value as Language);
                setSuccess(false);
              }}
            >
              {Object.entries(languageNames).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <p>
            Настройка сохраняется для всей рабочей области. Она применяется к
            новым запускам оценки, пользовательским метрикам и ответам
            ассистента.
          </p>
          <p>
            Сохранённые результаты и уже запущенные задачи сохраняют исходный
            язык. Изменение языка не запускает работу модели и не переводит
            прежние результаты. Язык исходного диалога фильтруется отдельно в
            обзоре.
          </p>
          <button
            className="primary"
            disabled={saving || !saved || saved === language}
          >
            {saving ? "Сохранение…" : "Сохранить настройки"}
          </button>
          {success && (
            <p className="notice" role="status">
              Настройки сохранены. Язык новых результатов:{" "}
              {languageNames[saved || "RU"]}.
            </p>
          )}
        </form>
      )}
      {error && (
        <ErrorBox>
          {error}{" "}
          {!saved && (
            <button onClick={() => setRevision((v) => v + 1)}>
              Повторить загрузку настроек
            </button>
          )}
        </ErrorBox>
      )}
    </section>
  );
}
