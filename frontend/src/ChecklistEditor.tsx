import { message, t } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { api, type Checklist, type CriterionDefinition } from "./api";
import { Empty, ErrorBox, errorText } from "./ui";
import Icon from "./Icon";
import { checklistName, criterionDisplay } from "./locale";
type Draft = CriterionDefinition & {
  rowKey: number;
  scaleText: string;
  weightText: string;
};
export default function ChecklistEditor({
  checklists,
  saved,
}: {
  checklists: Checklist[];
  saved: () => Promise<void>;
}) {
  const nextRowKey = useRef(0);
  const [addedRowKey, setAddedRowKey] = useState<number>();
  const [parent, setParent] = useState("cqa-v1");
  const [name, setName] = useState("");
  const [criteria, setCriteria] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const source = checklists.find((c) => c.id === parent);
    if (source) {
      setName(`${checklistName(source.id, source.name)} · ${t("revised")}`);
      setCriteria(
        source.criteria.map((c) => ({
          ...structuredClone(criterionDisplay(c, source.id)),
          rowKey: nextRowKey.current++,
          scaleText: c.allowed_values.join(", "),
          weightText: String(c.weight),
        })),
      );
      setSuccess("");
      setAddedRowKey(undefined);
    }
  }, [parent, checklists]);
  const update = (rowKey: number, patch: Partial<Draft>) =>
    setCriteria((list) =>
      list.map((c) => (c.rowKey === rowKey ? { ...c, ...patch } : c)),
    );
  const add = () => {
    const rowKey = nextRowKey.current++;
    setCriteria((list) => [
      ...list,
      {
        rowKey,
        id: "",
        title: "",
        description: "",
        answer_type: "boolean",
        allowed_values: [false, true],
        scale_meanings: {},
        weight: 0,
        weightText: "0",
        scaleText: "false, true",
        allow_na: false,
        na_condition: null,
        critical: false,
      },
    ]);
    setAddedRowKey(rowKey);
    setSuccess("");
  };
  const submit = async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (criteria.some((c) => !/^[a-z][a-z0-9_-]{0,63}$/.test(c.id)))
        throw new Error(
          "Criterion IDs must start with a lowercase letter and use at most 64 lowercase letters, digits, underscores or hyphens.",
        );
      if (new Set(criteria.map((c) => c.id)).size !== criteria.length)
        throw new Error("Criterion IDs must be unique.");
      const parsed = criteria.map(({ rowKey, scaleText, weightText, ...c }) => {
        const values =
          c.answer_type === "boolean"
            ? [false, true]
            : scaleText.split(",").map((v) => {
                if (!v.trim() || !Number.isFinite(Number(v)))
                  throw new Error(
                    `Enter finite numeric scale steps for ${c.title}.`,
                  );
                return Number(v);
              });
        if (!weightText.trim() || !Number.isFinite(Number(weightText)))
          throw new Error(`Enter a valid weight for ${c.title}.`);
        return {
          ...c,
          allowed_values: values,
          weight: Number(weightText),
          na_condition: c.allow_na ? c.na_condition : null,
        };
      });
      if (!parsed.some((c) => !c.critical && c.weight > 0))
        throw new Error("Keep at least one positively weighted criterion.");
      const result = await api.saveChecklist({
        name,
        parent_version_id: parent,
        criteria: parsed,
      });
      await saved();
      setSuccess(
        `Saved ${result.name} as ${result.id}. Select this version in a conversation to evaluate it. Prior assessments retain their original checklist.`,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (!checklists.length)
    return <Empty>{t("Loading checklist versions…")}</Empty>;
  return (
    <section className="panel checklist-editor">
      <div className="section-head">
        <div>
          <h2>{t("Versioned quality checklist")}</h2>
          <p>
            {t(
              "Changes create a new immutable version. Evaluation is a separate action.",
            )}
          </p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="filter-bar">
          <label>
            {t("Start from version")}
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              {checklists.map((c) => (
                <option key={c.id} value={c.id}>
                  {checklistName(c.id, c.name)} ({c.id})
                </option>
              ))}
            </select>
          </label>
          <label className="grow">
            {t("New version name")}
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
        <div className="rubric-summary">
          <Icon name="shield" size={26} />
          <div>
            <strong>
              {criteria.length} {t(" criteria · ")}{" "}
              {criteria.filter((c) => c.allow_na).length} {t(" support N/A ")}
            </strong>
            <small>
              {t(
                "Changes save as a new version. Existing assessments keep their original checklist.",
              )}
            </small>
          </div>
        </div>
        <details>
          <summary>{t("How scoring and versions work")}</summary>
          <p>
            {t(
              "Weighted criteria normalize over applicable weight. Critical is a separate boolean with zero weight. N/A requires an explicit applicability condition. To replace a criterion, remove its draft row and add a criterion with a new ID. Prior versions and assessments are preserved.",
            )}
          </p>
        </details>
        {criteria.map((c, index) => (
          <details
            className="criterion-editor"
            key={c.rowKey}
            open={index === 0 || c.rowKey === addedRowKey}
          >
            <summary>
              {c.title || t("New criterion")}{" "}
              <span>
                {c.weightText} {t(" weight · ")}
                {t(c.answer_type)}
                {c.allow_na ? t(" · N/A allowed") : ""}
              </span>
            </summary>
            <div className="editor-grid">
              <label>
                {t("Criterion ID")}
                <input
                  required
                  maxLength={64}
                  pattern={"[a-z][a-z0-9_\\-]{0,63}"}
                  value={c.id}
                  onChange={(e) => update(c.rowKey, { id: e.target.value })}
                />
              </label>
              <label>
                {t("Title")}
                <input
                  required
                  value={c.title}
                  onChange={(e) => update(c.rowKey, { title: e.target.value })}
                />
              </label>
              <label className="full">
                {t("Criterion wording")}
                <textarea
                  required
                  value={c.description}
                  onChange={(e) =>
                    update(c.rowKey, { description: e.target.value })
                  }
                />
              </label>
              <label>
                {t("Answer type")}
                <select
                  disabled={c.critical}
                  value={c.answer_type}
                  onChange={(e) =>
                    update(c.rowKey, {
                      answer_type: e.target.value as Draft["answer_type"],
                      scaleText:
                        e.target.value === "boolean"
                          ? "false, true"
                          : "0, 5, 10",
                      scale_meanings: {},
                    })
                  }
                >
                  <option value="boolean">{t("Boolean")}</option>
                  <option value="scale">{t("Numeric scale")}</option>
                </select>
              </label>
              <label>
                {t("Weight")}
                <input
                  type="number"
                  min="0"
                  step="any"
                  disabled={c.critical}
                  value={c.weightText}
                  onChange={(e) =>
                    update(c.rowKey, { weightText: e.target.value })
                  }
                />
              </label>
              {c.answer_type === "scale" && (
                <label className="full">
                  {t("Allowed raw steps, separated by commas")}
                  <input
                    required
                    value={c.scaleText}
                    onChange={(e) =>
                      update(c.rowKey, { scaleText: e.target.value })
                    }
                  />
                </label>
              )}
              <label className="inline-label">
                <input
                  type="checkbox"
                  disabled={c.critical}
                  checked={c.allow_na}
                  onChange={(e) =>
                    update(c.rowKey, {
                      allow_na: e.target.checked,
                      na_condition: e.target.checked ? "" : null,
                    })
                  }
                />
                {t("Allow N/A")}
              </label>
              <span>{c.critical ? t("Unscored critical flag") : ""}</span>
              {c.allow_na && (
                <label className="full">
                  {t("N/A condition")}
                  <textarea
                    required
                    value={c.na_condition || ""}
                    onChange={(e) =>
                      update(c.rowKey, { na_condition: e.target.value })
                    }
                  />
                </label>
              )}
              <div className="full">
                <h4>{t("Scale meanings")}</h4>
                {(c.answer_type === "boolean"
                  ? ["false", "true"]
                  : c.scaleText
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean)
                ).map((value) => (
                  <label key={value}>
                    {t("Meaning of ")}
                    {t(value)}
                    <input
                      value={c.scale_meanings?.[value] || ""}
                      onChange={(e) =>
                        update(c.rowKey, {
                          scale_meanings: {
                            ...c.scale_meanings,
                            [value]: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="full">
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy}
                  onClick={() => {
                    setCriteria((list) =>
                      list.filter((row) => row.rowKey !== c.rowKey),
                    );
                    setSuccess("");
                  }}
                >
                  {t("Remove criterion")}
                </button>
              </div>
            </div>
          </details>
        ))}
        {error && <ErrorBox>{message(error)}</ErrorBox>}
        {success && (
          <div className="notice" role="status">
            {message(success)}
          </div>
        )}
        <div className="checklist-actions">
          <button type="button" disabled={busy} onClick={add}>
            {t("Add criterion")}
          </button>
          <button className="primary" disabled={busy || !name.trim()}>
            {busy ? t("Saving new version…") : t("Save new checklist version")}
          </button>
        </div>
      </form>
    </section>
  );
}
