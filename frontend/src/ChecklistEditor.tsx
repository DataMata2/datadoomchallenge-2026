import { useEffect, useState } from "react";
import { api, type Checklist, type CriterionDefinition } from "./api";
import { Empty, ErrorBox, errorText } from "./ui";
type Draft = CriterionDefinition & { scaleText: string; weightText: string };
export default function ChecklistEditor({
  checklists,
  saved,
}: {
  checklists: Checklist[];
  saved: () => Promise<void>;
}) {
  const [parent, setParent] = useState("cqa-v1");
  const [name, setName] = useState("");
  const [criteria, setCriteria] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const source = checklists.find((c) => c.id === parent);
    if (source) {
      setName(`${source.name} · revised`);
      setCriteria(
        source.criteria.map((c) => ({
          ...structuredClone(c),
          scaleText: c.allowed_values.join(", "),
          weightText: String(c.weight),
        })),
      );
      setSuccess("");
    }
  }, [parent, checklists]);
  const update = (index: number, patch: Partial<Draft>) =>
    setCriteria((list) =>
      list.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  const submit = async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const parsed = criteria.map(({ scaleText, weightText, ...c }) => {
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
  if (!checklists.length) return <Empty>Loading checklist versions…</Empty>;
  return (
    <section className="panel checklist-editor">
      <div className="section-head">
        <div>
          <h2>Versioned quality checklist</h2>
          <p>
            Changes create a new immutable version. Evaluation is a separate
            action.
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
            Start from version
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              {checklists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </label>
          <label className="grow">
            New version name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
        <div className="notice">
          Weighted criteria normalize over applicable weight. Critical is a
          separate boolean with zero weight. N/A requires an explicit
          applicability condition.
        </div>
        {criteria.map((c, index) => (
          <details className="criterion-editor" key={c.id} open={index === 0}>
            <summary>
              {c.title}{" "}
              <span>
                {c.weightText} weight · {c.answer_type}
                {c.allow_na ? " · N/A allowed" : ""}
              </span>
            </summary>
            <div className="editor-grid">
              <label>
                Criterion ID
                <input value={c.id} disabled />
              </label>
              <label>
                Title
                <input
                  required
                  value={c.title}
                  onChange={(e) => update(index, { title: e.target.value })}
                />
              </label>
              <label className="full">
                Criterion wording
                <textarea
                  required
                  value={c.description}
                  onChange={(e) =>
                    update(index, { description: e.target.value })
                  }
                />
              </label>
              <label>
                Answer type
                <select
                  disabled={c.critical}
                  value={c.answer_type}
                  onChange={(e) =>
                    update(index, {
                      answer_type: e.target.value as Draft["answer_type"],
                      scaleText:
                        e.target.value === "boolean"
                          ? "false, true"
                          : "0, 5, 10",
                      scale_meanings: {},
                    })
                  }
                >
                  <option value="boolean">Boolean</option>
                  <option value="scale">Numeric scale</option>
                </select>
              </label>
              <label>
                Weight
                <input
                  type="number"
                  min="0"
                  step="any"
                  disabled={c.critical}
                  value={c.weightText}
                  onChange={(e) =>
                    update(index, { weightText: e.target.value })
                  }
                />
              </label>
              {c.answer_type === "scale" && (
                <label className="full">
                  Allowed raw steps, separated by commas
                  <input
                    required
                    value={c.scaleText}
                    onChange={(e) =>
                      update(index, { scaleText: e.target.value })
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
                    update(index, {
                      allow_na: e.target.checked,
                      na_condition: e.target.checked ? "" : null,
                    })
                  }
                />
                Allow N/A
              </label>
              <span>{c.critical ? "Unscored critical flag" : ""}</span>
              {c.allow_na && (
                <label className="full">
                  N/A condition
                  <textarea
                    required
                    value={c.na_condition || ""}
                    onChange={(e) =>
                      update(index, { na_condition: e.target.value })
                    }
                  />
                </label>
              )}
              <div className="full">
                <h4>Scale meanings</h4>
                {(c.answer_type === "boolean"
                  ? ["false", "true"]
                  : c.scaleText
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean)
                ).map((value) => (
                  <label key={value}>
                    Meaning of {value}
                    <input
                      value={c.scale_meanings?.[value] || ""}
                      onChange={(e) =>
                        update(index, {
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
            </div>
          </details>
        ))}
        {error && <ErrorBox>{error}</ErrorBox>}
        {success && (
          <div className="notice" role="status">
            {success}
          </div>
        )}
        <button className="primary" disabled={busy || !name.trim()}>
          {busy ? "Saving new version…" : "Save new checklist version"}
        </button>
      </form>
    </section>
  );
}
