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
      setName(`${checklistName(source.id, source.name)} · новая версия`);
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
          "Идентификатор критерия должен начинаться со строчной латинской буквы и содержать до 64 строчных латинских букв, цифр, подчёркиваний или дефисов.",
        );
      if (new Set(criteria.map((c) => c.id)).size !== criteria.length)
        throw new Error("Идентификаторы критериев должны быть уникальными.");
      const parsed = criteria.map(({ rowKey, scaleText, weightText, ...c }) => {
        const values =
          c.answer_type === "boolean"
            ? [false, true]
            : scaleText.split(",").map((v) => {
                if (!v.trim() || !Number.isFinite(Number(v)))
                  throw new Error(
                    `Введите конечные числовые значения шкалы для «${c.title}».`,
                  );
                return Number(v);
              });
        if (!weightText.trim() || !Number.isFinite(Number(weightText)))
          throw new Error(`Введите корректный вес для «${c.title}».`);
        return {
          ...c,
          allowed_values: values,
          weight: Number(weightText),
          na_condition: c.allow_na ? c.na_condition : null,
        };
      });
      if (!parsed.some((c) => !c.critical && c.weight > 0))
        throw new Error(
          "Оставьте хотя бы один критерий с положительным весом.",
        );
      const result = await api.saveChecklist({
        name,
        parent_version_id: parent,
        criteria: parsed,
      });
      await saved();
      setSuccess(
        `Версия «${result.name}» сохранена: ${result.id}. Выберите её в диалоге для оценки. Предыдущие оценки сохраняют исходный чек-лист.`,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (!checklists.length) return <Empty>Загрузка версий чек-листа…</Empty>;
  return (
    <section className="panel checklist-editor">
      <div className="section-head">
        <div>
          <h2>Версии чек-листа качества</h2>
          <p>
            Изменения создают новую неизменяемую версию. Оценка запускается
            отдельно.
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
            Исходная версия
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              {checklists.map((c) => (
                <option key={c.id} value={c.id}>
                  {checklistName(c.id, c.name)} ({c.id})
                </option>
              ))}
            </select>
          </label>
          <label className="grow">
            Название новой версии
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
              {criteria.length} критериев ·{" "}
              {criteria.filter((c) => c.allow_na).length} допускают Н/П
            </strong>
            <small>
              Изменения сохраняются в новой версии. Существующие оценки
              сохраняют исходный чек-лист.
            </small>
          </div>
        </div>
        <details>
          <summary>Как устроены оценка и версии</summary>
          <p>
            Взвешенные критерии нормируются по применимому весу. Критическое
            нарушение — отдельный логический признак с нулевым весом. Для Н/П
            нужно явное условие неприменимости. Чтобы заменить критерий, удалите
            строку черновика и добавьте критерий с новым идентификатором.
            Предыдущие версии и оценки сохраняются.
          </p>
        </details>
        {criteria.map((c, index) => (
          <details
            className="criterion-editor"
            key={c.rowKey}
            open={index === 0 || c.rowKey === addedRowKey}
          >
            <summary>
              {c.title || "Новый критерий"}{" "}
              <span>
                {c.weightText} вес ·{" "}
                {c.answer_type === "boolean" ? "Да / Нет" : "Числовая шкала"}
                {c.allow_na ? " · Н/П допускается" : ""}
              </span>
            </summary>
            <div className="editor-grid">
              <label>
                Идентификатор критерия
                <input
                  required
                  maxLength={64}
                  pattern={"[a-z][a-z0-9_\\-]{0,63}"}
                  value={c.id}
                  onChange={(e) => update(c.rowKey, { id: e.target.value })}
                />
              </label>
              <label>
                Название
                <input
                  required
                  value={c.title}
                  onChange={(e) => update(c.rowKey, { title: e.target.value })}
                />
              </label>
              <label className="full">
                Формулировка критерия
                <textarea
                  required
                  value={c.description}
                  onChange={(e) =>
                    update(c.rowKey, { description: e.target.value })
                  }
                />
              </label>
              <label>
                Тип ответа
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
                  <option value="boolean">Да / Нет</option>
                  <option value="scale">Числовая шкала</option>
                </select>
              </label>
              <label>
                Вес
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
                  Допустимые значения шкалы через запятую
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
                Разрешить Н/П
              </label>
              <span>
                {c.critical ? "Критическое нарушение без баллов" : ""}
              </span>
              {c.allow_na && (
                <label className="full">
                  Условие Н/П
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
                <h4>Значения шкалы</h4>
                {(c.answer_type === "boolean"
                  ? ["false", "true"]
                  : c.scaleText
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean)
                ).map((value) => (
                  <label key={value}>
                    Значение{" "}
                    {value === "true"
                      ? "Да"
                      : value === "false"
                        ? "Нет"
                        : value}
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
                  Удалить критерий
                </button>
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
        <div className="checklist-actions">
          <button type="button" disabled={busy} onClick={add}>
            Добавить критерий
          </button>
          <button className="primary" disabled={busy || !name.trim()}>
            {busy
              ? "Сохранение новой версии…"
              : "Сохранить новую версию чек-листа"}
          </button>
        </div>
      </form>
    </section>
  );
}
