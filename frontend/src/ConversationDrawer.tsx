import { message, t } from "./i18n";
import { useEffect, useRef, useState } from "react";
import {
  api,
  type Appeal,
  type Checklist,
  type ConversationResponse,
  type CriterionDefinition,
  type Evaluation,
  type Run,
  type ScoredCriterion,
  type SavedObservation,
} from "./api";
import {
  activeRun,
  Dialog,
  Empty,
  ErrorBox,
  errorText,
  metricNames,
  raw,
  RunProgress,
  score,
  time,
} from "./ui";
import {
  analysisLanguage,
  criterionDisplay,
  checklistName,
  languageName,
} from "./locale";
type Props = {
  id: string;
  dataset: string;
  metric?: string;
  turns?: number[];
  saved?: SavedObservation;
  checklists: Checklist[];
  close: () => void;
  changed: () => void;
};
export default function ConversationDrawer({
  id,
  dataset,
  metric,
  turns,
  saved,
  checklists,
  close,
  changed,
}: Props) {
  const [conversation, setConversation] = useState<ConversationResponse>();
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [version, setVersion] = useState(saved?.checklistVersionId || "cqa-v1");
  const [criterionId, setCriterionId] = useState(metric || "final_score");
  const [highlight, setHighlight] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [original, setOriginal] = useState(false);
  const [run, setRun] = useState<Run>();
  const [runError, setRunError] = useState("");
  const [reload, setReload] = useState(0);
  const [mobilePane, setMobilePane] = useState("assessment");
  const turnRefs = useRef(new Map<number, HTMLLIElement>());
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setEvaluation(null);
    api
      .conversation(dataset, id, version)
      .then(async (c) => {
        const e = c.evaluation_id
          ? await api.evaluation(c.evaluation_id)
          : null;
        if (alive) {
          setConversation(c);
          setEvaluation(e);
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
  }, [id, dataset, version, reload]);
  const runStorageKey = `cqa-active-run:${dataset}/${id}`;
  useEffect(() => {
    const savedId = localStorage.getItem(runStorageKey);
    if (!savedId) return;
    let alive = true;
    api
      .run(savedId)
      .then((saved) => {
        if (!alive) return;
        if (
          saved.dataset_id === dataset &&
          saved.conversation_ids.includes(id) &&
          activeRun(saved)
        ) {
          setRun(saved);
          if (saved.checklist_version_id)
            setVersion(saved.checklist_version_id);
        } else localStorage.removeItem(runStorageKey);
      })
      .catch((e) => {
        if (alive) setRunError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [runStorageKey]);
  useEffect(() => {
    if (!run) return;
    if (activeRun(run)) localStorage.setItem(runStorageKey, run.id);
    else localStorage.removeItem(runStorageKey);
  }, [run, runStorageKey]);
  useEffect(() => {
    if (!run || !activeRun(run)) return;
    let alive = true;
    const timer = setTimeout(() => {
      api
        .run(run.id)
        .then((next) => {
          if (!alive) return;
          setRun(next);
          setRunError("");
          if (!activeRun(next)) {
            setReload((v) => v + 1);
            changed();
          }
        })
        .catch((e) => {
          if (alive) setRunError(errorText(e));
        });
    }, 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [run, runError]);
  const savedCriterion = saved?.observation.final?.criteria.find(
    (c) => c.criterion_id === criterionId,
  );
  const differs =
    saved &&
    (saved.observation.evaluation_id !== (evaluation?.id ?? null) ||
      saved.observation.evaluation_status !==
        (evaluation?.status ?? "unevaluated") ||
      JSON.stringify(saved.observation.final) !==
        JSON.stringify(evaluation?.final ?? null));
  const current = original ? evaluation?.original : evaluation?.final;
  const criterionTitle = (id: string) =>
    evaluation?.checklist_version_id === "cqa-v1"
      ? metricNames[id] || id
      : evaluation?.checklist_snapshot.criteria.find(
          (criterion) => criterion.id === id,
        )?.title || id;
  const selected = current?.criteria.find(
    (c) => c.criterion_id === criterionId,
  );
  const storedDefinition = evaluation?.checklist_snapshot.criteria.find(
    (c) => c.id === criterionId,
  );
  const definition =
    storedDefinition && evaluation
      ? criterionDisplay(storedDefinition, evaluation.checklist_version_id)
      : undefined;
  const jump = (turns: number[], reveal = true) => {
    if (reveal) setMobilePane("transcript");
    setHighlight(turns);
    requestAnimationFrame(() =>
      turnRefs.current
        .get(turns[0])
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };
  useEffect(() => {
    if (selected) setHighlight(selected.evidence_turns);
  }, [selected]);
  useEffect(() => {
    if (conversation && turns?.length) jump(turns);
  }, [conversation, turns]);
  const refresh = () => {
    setReload((v) => v + 1);
    changed();
  };
  const evaluate = async () => {
    setBusy(true);
    setError("");
    try {
      setRun(
        await api.startRun({
          dataset_id: dataset,
          conversation_ids: [id],
          checklist_version_id: version,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={t("Conversation {arg0}", { arg0: id })} close={close} wide>
      <div className="conversation-meta">
        <span>{dataset}</span>
        <span>{conversation?.channel ? t(conversation.channel) : ""}</span>
        <span>{languageName(conversation?.language)}</span>
        <span>{time(conversation?.demo_started_at)}</span>
      </div>
      {error && <ErrorBox>{message(error)}</ErrorBox>}
      {loading ? (
        <Empty>{t("Loading the source and assessment…")}</Empty>
      ) : (
        conversation && (
          <>
            <div
              className="mobile-review-tabs"
              role="group"
              aria-label={t("Conversation panel")}
            >
              <button
                aria-pressed={mobilePane === "transcript"}
                onClick={() => setMobilePane("transcript")}
              >
                {t("Transcript")}
              </button>
              <button
                aria-pressed={mobilePane === "assessment"}
                onClick={() => setMobilePane("assessment")}
              >
                {t("Assessment")}
              </button>
            </div>
            <div className="conversation-layout" data-mobile-pane={mobilePane}>
              <section className="transcript">
                <div className="section-head">
                  <div>
                    <h3>{t("Original transcript")}</h3>
                    <p>
                      {t(
                        "One-based turn numbers include every speaker. Original timestamps are preserved.",
                      )}
                    </p>
                  </div>
                </div>
                {conversation.audio_url &&
                  /^https?:\/\//i.test(conversation.audio_url) && (
                    <div className="recording">
                      <a
                        href={conversation.audio_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("Open source recording")}
                      </a>
                      <audio
                        controls
                        preload="none"
                        src={conversation.audio_url}
                      >
                        {t("Use the recording link to listen.")}
                      </audio>
                    </div>
                  )}
                <ol className="turns">
                  {conversation.transcript.map((turn, index) => (
                    <li
                      key={index}
                      ref={(element) => {
                        if (element) turnRefs.current.set(index + 1, element);
                        else turnRefs.current.delete(index + 1);
                      }}
                      className={`${turn.speaker} ${highlight.includes(index + 1) ? "highlight" : ""}`}
                    >
                      <div className="turn-meta">
                        <button onClick={() => setHighlight([index + 1])}>
                          #{index + 1}
                        </button>
                        <strong>{t(turn.speaker)}</strong>
                        <time title={turn.timestamp}>{turn.timestamp}</time>
                      </div>
                      <p
                        translate="no"
                        lang={
                          { RU: "ru", KZ: "kk", EN: "en" }[
                            conversation.language
                          ]
                        }
                      >
                        {turn.text}
                      </p>
                    </li>
                  ))}
                </ol>
                <details>
                  <summary>{t("Timestamp and scheduling provenance")}</summary>
                  <p>
                    {t("Observed source span:")}{" "}
                    {conversation.observed_span.started_at} {t(" to ")}{" "}
                    {conversation.observed_span.ended_at} (
                    {conversation.observed_span.duration_seconds}{" "}
                    {t(
                      " seconds). This derives from the first and last transcript turns.",
                    )}
                  </p>
                  <p>
                    {t(conversation.scheduling.interpretation)} {t(" Mode:")}{" "}
                    {t(conversation.scheduling.mode)}
                    {t(" ; seed: ")} {conversation.scheduling.seed ?? t("none")}
                    {t(" ; algorithm: ")}{" "}
                    {conversation.scheduling.algorithm
                      ? t(conversation.scheduling.algorithm)
                      : t("none")}
                    {t(". Scheduling is independent of quality scores.")}
                  </p>
                </details>
              </section>
              <section className="assessment">
                {saved && (
                  <section
                    className="notice saved-observation"
                    aria-label={t("Saved report observation")}
                  >
                    <h3>{t("Saved report observation")}</h3>
                    <p>
                      {t("Generated: ")}
                      <time title={saved.generatedAt}>
                        {time(saved.generatedAt)}
                      </time>
                      {t(". Checklist:")} {saved.checklistVersionId}.
                    </p>
                    <p>
                      {t("Evaluation: ")}
                      {saved.observation.evaluation_id || t("none")}
                      {t(". Revision: ")}
                      {saved.observation.revision || t("none")}
                      {t(". Status:")} {t(saved.observation.evaluation_status)}.
                    </p>
                    <p>
                      {t("Copied quality score:")}{" "}
                      {score(saved.observation.final?.final_score)}
                      {t(". Critical flag: ")}
                      {raw(saved.observation.final?.critical_flag)}.
                    </p>
                    {savedCriterion && (
                      <>
                        <p>
                          {metricNames[criterionId]} {t(" copied raw value:")}{" "}
                          {raw(savedCriterion.value)}.{" "}
                          {savedCriterion.rationale}
                        </p>
                        <p>
                          {t("Saved evidence:")}{" "}
                          {savedCriterion.evidence_turns.map((turn) => (
                            <button
                              className="turn-link"
                              key={turn}
                              onClick={() => jump([turn])}
                            >
                              #{turn}
                            </button>
                          ))}
                        </p>
                      </>
                    )}
                    <p>
                      {t(
                        "The saved report remains unchanged until explicitly refreshed.",
                      )}
                    </p>
                  </section>
                )}
                {saved && (
                  <h3>
                    {differs
                      ? t("Current values differ from saved report values")
                      : t("Current values match saved report values")}
                  </h3>
                )}
                <div className="evaluation-controls">
                  <label>
                    {t("Checklist version")}
                    <select
                      value={version}
                      onChange={(e) => {
                        setVersion(e.target.value);
                        setOriginal(false);
                      }}
                    >
                      {checklists.map((c) => (
                        <option key={c.id} value={c.id}>
                          {checklistName(c.id, c.name)} ({c.id})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary"
                    disabled={busy || !!(run && activeRun(run))}
                    onClick={evaluate}
                  >
                    {busy ? t("Starting…") : t("Evaluate this conversation")}
                  </button>
                  <small>
                    {t(
                      "Starts a model assessment using the selected checklist. Existing results remain in history.",
                    )}
                  </small>
                </div>
                {run && (
                  <RunProgress
                    run={run}
                    cancel={async () => {
                      try {
                        setRun(await api.cancelRun(run.id));
                      } catch (e) {
                        setRunError(errorText(e));
                      }
                    }}
                  />
                )}
                {runError && (
                  <ErrorBox>
                    {message(runError)}{" "}
                    <button onClick={() => setRunError("")}>
                      {t("Retry progress")}
                    </button>
                  </ErrorBox>
                )}
                {!evaluation ? (
                  <Empty>
                    {t(
                      "No evaluation exists for this checklist version. Start an evaluation to assess it.",
                    )}
                  </Empty>
                ) : evaluation.status === "error" ? (
                  <ErrorBox>
                    {t("Evaluation failed: ")}
                    {evaluation.error}
                    {t(". No quality score is available.")}
                  </ErrorBox>
                ) : (
                  <>
                    <div className="score-summary">
                      <strong>
                        {score(current?.final_score)}
                        <small>/100</small>
                      </strong>
                      <div>
                        <span>
                          {current?.critical_flag
                            ? t("Critical violation flagged")
                            : t("No critical violation flagged")}
                        </span>
                        <p>
                          {t(
                            "Critical is unscored and does not automatically zero the total.",
                          )}
                        </p>
                      </div>
                    </div>
                    <label className="inline-label">
                      <input
                        type="checkbox"
                        checked={original}
                        onChange={(e) => setOriginal(e.target.checked)}
                      />
                      {t("Show original assessment before review")}
                    </label>
                    <div
                      className="criterion-tabs"
                      role="group"
                      aria-label={t("Inspect criterion")}
                    >
                      <button
                        className={
                          criterionId === "final_score" ? "selected" : ""
                        }
                        onClick={() => setCriterionId("final_score")}
                      >
                        {t("Score calculation")}
                      </button>
                      {current?.criteria.map((c) => (
                        <button
                          className={
                            criterionId === c.criterion_id ? "selected" : ""
                          }
                          onClick={() => {
                            setCriterionId(c.criterion_id);
                            jump(c.evidence_turns, false);
                          }}
                          key={c.criterion_id}
                        >
                          {criterionTitle(c.criterion_id)}
                          <span>{raw(c.value)}</span>
                        </button>
                      ))}
                    </div>
                    {criterionId === "final_score" ? (
                      <div className="criterion-detail">
                        <h3>{t("How this score is calculated")}</h3>
                        <p>
                          {t("Earned points ")}
                          {score(current?.earned_points)}{" "}
                          {t(" ÷ applicable weight ")}
                          {score(current?.applicable_weight)} × 100 ={" "}
                          <strong>{score(current?.final_score)}</strong>.
                        </p>
                        <p>
                          {t(
                            "N/A criteria contribute no points and are excluded from applicable weight. The backend normalizes over applicable weight and rounds the total to two decimal places.",
                          )}
                        </p>
                        <table>
                          <thead>
                            <tr>
                              <th>{t("Criterion")}</th>
                              <th>{t("Raw")}</th>
                              <th>{t("Points")}</th>
                              <th>{t("Contribution /100")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {current?.criteria.map((c) => (
                              <tr key={c.criterion_id}>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      setCriterionId(c.criterion_id);
                                      jump(c.evidence_turns, false);
                                    }}
                                  >
                                    {criterionTitle(c.criterion_id)}
                                  </button>
                                </td>
                                <td>{raw(c.value)}</td>
                                <td>
                                  {c.points == null ? "N/A" : score(c.points)}
                                </td>
                                <td>
                                  {c.weighted_score == null
                                    ? t("Unscored")
                                    : score(c.weighted_score)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      selected &&
                      definition && (
                        <CriterionDetail
                          criterion={selected}
                          definition={definition}
                          evaluation={evaluation}
                          jump={jump}
                          refresh={refresh}
                          original={original}
                        />
                      )
                    )}
                    <details className="assessment-identity">
                      <summary>{t("Assessment provenance")}</summary>
                      <p>
                        {t("Checklist: ")}
                        {evaluation.checklist_version_id}
                        <br />
                        {t("Model: ")}
                        {evaluation.model.name} ({t(evaluation.model.mode)})
                        <br />
                        {t("Analysis language")}:{" "}
                        {analysisLanguage(evaluation.analysis_language)}
                        <br />
                        {t("Prompt version: ")}
                        {evaluation.prompt_version}
                        <br />
                        {t("Created: ")}
                        {time(evaluation.created_at)}
                        <br />
                        {t("Assessment: ")}
                        {evaluation.id}
                      </p>
                    </details>
                  </>
                )}
              </section>
            </div>
          </>
        )
      )}
    </Dialog>
  );
}
function CriterionDetail({
  criterion,
  definition,
  evaluation,
  jump,
  refresh,
  original,
}: {
  criterion: ScoredCriterion;
  definition: CriterionDefinition;
  evaluation: Evaluation;
  jump: (turns: number[]) => void;
  refresh: () => void;
  original: boolean;
}) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const appeals = evaluation.appeals.filter(
    (a) => a.criterion_id === criterion.criterion_id,
  );
  useEffect(() => {
    setComment("");
    setError("");
  }, [criterion.criterion_id]);
  return (
    <div className="criterion-detail">
      <h3>{definition.title}</h3>
      <p>{definition.description}</p>
      <dl className="score-facts">
        <div>
          <dt>{t("Raw value")}</dt>
          <dd>{raw(criterion.value)}</dd>
        </div>
        <div>
          <dt>{t("Maximum")}</dt>
          <dd>
            {definition.answer_type === "boolean"
              ? t("Yes")
              : raw(
                  Math.max(
                    ...(definition.allowed_values.filter(
                      (v) => typeof v === "number",
                    ) as number[]),
                  ),
                )}
          </dd>
        </div>
        <div>
          <dt>{t("Weight")}</dt>
          <dd>{raw(definition.weight)}</dd>
        </div>
        <div>
          <dt>{t("Weighted contribution")}</dt>
          <dd>
            {criterion.weighted_score == null
              ? t("Unscored / N/A")
              : `${score(criterion.weighted_score)} /100`}
          </dd>
        </div>
      </dl>
      <p>
        {criterion.applicable
          ? t("Applicable to this conversation.")
          : t("Not applicable; excluded from the score denominator.")}{" "}
        {definition.allow_na
          ? t("N/A condition: {arg0}", {
              arg0: definition.na_condition || "",
            })
          : t("N/A is not permitted.")}
      </p>
      {Object.keys(definition.scale_meanings || {}).length > 0 && (
        <details>
          <summary>{t("Scoring scale")}</summary>
          <ul>
            {Object.entries(definition.scale_meanings || {}).map(
              ([value, meaning]) => (
                <li key={value}>
                  <strong>{t(value)}</strong>: {meaning}
                </li>
              ),
            )}
          </ul>
        </details>
      )}
      <blockquote translate="no">{criterion.rationale}</blockquote>
      <div className="row">
        <strong>{t("Source evidence")}</strong>
        {criterion.evidence_turns.map((turn) => (
          <button className="turn-link" key={turn} onClick={() => jump([turn])}>
            {t("Turn #")}
            {turn}
          </button>
        ))}
        <button
          className="text-button"
          onClick={() => jump(criterion.evidence_turns)}
        >
          {t("Highlight all evidence")}
        </button>
      </div>
      <h4>{t("Appeal and review history")}</h4>
      {appeals.length ? (
        appeals.map((a) => (
          <AppealCard
            key={a.id}
            appeal={a}
            definition={definition}
            refresh={refresh}
          />
        ))
      ) : (
        <p className="muted">{t("No appeals for this criterion.")}</p>
      )}
      {original && (
        <p className="notice">
          {t(
            "You are viewing the original assessment. A new appeal addresses the current final value.",
          )}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api.appeal({
              evaluation_id: evaluation.id,
              criterion_id: criterion.criterion_id,
              comment,
            });
            setComment("");
            refresh();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {t("Reason for appeal")}
          <textarea
            required
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t(
              "Explain the disputed judgment and refer to source turns.",
            )}
          />
        </label>
        <button disabled={busy || !comment.trim()}>
          {busy ? t("Saving…") : t("Submit appeal")}
        </button>
      </form>
      {error && <ErrorBox>{message(error)}</ErrorBox>}
    </div>
  );
}
function AppealCard({
  appeal,
  definition,
  refresh,
}: {
  appeal: Appeal;
  definition: CriterionDefinition;
  refresh: () => void;
}) {
  const [action, setAction] = useState<"confirm" | "change">("confirm");
  const [value, setValue] = useState(
    JSON.stringify(definition.allowed_values[0]),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <article className="appeal">
      <div className="row">
        <strong>{t(appeal.status)}</strong>
        <time>{time(appeal.created_at)}</time>
      </div>
      <p translate="no">{appeal.comment}</p>
      {appeal.decision ? (
        <div className="decision">
          <strong>
            {appeal.decision.action === "change"
              ? t("Changed to {arg0}", { arg0: raw(appeal.decision.value) })
              : t("Confirmed {arg0}", { arg0: raw(appeal.decision.value) })}
          </strong>
          <p translate="no">{appeal.decision.reason}</p>
          <small>{time(appeal.decision.created_at)}</small>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api.decide(
                appeal.id,
                action === "confirm"
                  ? { action, reason }
                  : {
                      action,
                      reason,
                      value: JSON.parse(value) as boolean | number | null,
                    },
              );
              refresh();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {t("Reviewer decision")}
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as typeof action)}
            >
              <option value="confirm">{t("Confirm current value")}</option>
              <option value="change">{t("Change value")}</option>
            </select>
          </label>
          {action === "change" && (
            <label>
              {t("Reviewed value")}
              <select value={value} onChange={(e) => setValue(e.target.value)}>
                {definition.allowed_values.map((v) => (
                  <option key={JSON.stringify(v)} value={JSON.stringify(v)}>
                    {raw(v)}
                  </option>
                ))}
                {definition.allow_na && <option value="null">N/A</option>}
              </select>
            </label>
          )}
          <label>
            {t("Decision reason")}
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={busy || !reason.trim()}>
            {busy ? t("Recording…") : t("Record reviewer decision")}
          </button>
        </form>
      )}
      {error && <ErrorBox>{message(error)}</ErrorBox>}
    </article>
  );
}
