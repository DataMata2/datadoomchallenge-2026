import { t, message, useLocale } from "./i18n";
import { useEffect, useState } from "react";
import { api, type WorkspaceSettings } from "./api";
import { languageNames } from "./locale";
import { Empty, ErrorBox, errorText } from "./ui";

type Language = NonNullable<WorkspaceSettings["analysis_language"]>;
export default function Settings() {
  useLocale();
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
          <h2 id="settings-heading">{t("Analysis settings")}</h2>
          <p>
            {t("Choose the language of new assessments and assistant replies.")}
          </p>
        </div>
      </div>
      {loading ? (
        <Empty>{t("Loading settings…")}</Empty>
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
            {t("Analysis language")}
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
            {t(
              "This preference is saved for the whole workspace. It applies to new evaluation runs, custom metrics and assistant replies.",
            )}
          </p>
          <p>
            {t(
              "Saved results and existing jobs keep their original language. Changing the language does not start model work or translate previous results. The source conversation language is filtered separately in the overview.",
            )}
          </p>
          <button
            className="primary"
            disabled={saving || !saved || saved === language}
          >
            {saving ? t("Saving…") : t("Save settings")}
          </button>
          {success && (
            <p className="notice" role="status">
              {t("Settings saved. Language for new results:")}{" "}
              {languageNames[saved || "RU"]}.
            </p>
          )}
        </form>
      )}
      {error && (
        <ErrorBox>
          {message(error)}{" "}
          {!saved && (
            <button onClick={() => setRevision((v) => v + 1)}>
              {t("Retry loading settings")}
            </button>
          )}
        </ErrorBox>
      )}
    </section>
  );
}
