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
  const selected = current?.criteria.find(
    (c) => c.criterion_id === criterionId,
  );
  const definition = evaluation?.checklist_snapshot.criteria.find(
    (c) => c.id === criterionId,
  );
  const jump = (turns: number[]) => {
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
    <Dialog title={`Conversation ${id}`} close={close} wide>
      <div className="conversation-meta">
        <span>{dataset}</span>
        <span>{conversation?.channel}</span>
        <span>{conversation?.language}</span>
        <span>{time(conversation?.demo_started_at)}</span>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading ? (
        <Empty>Loading the source and assessment…</Empty>
      ) : (
        conversation && (
          <>
            <div className="conversation-layout">
              <section className="transcript">
                <div className="section-head">
                  <div>
                    <h3>Original transcript</h3>
                    <p>
                      One-based turn numbers include every speaker. Original
                      timestamps are preserved.
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
                        Open source recording
                      </a>
                      <audio
                        controls
                        preload="none"
                        src={conversation.audio_url}
                      >
                        Use the recording link to listen.
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
                        <strong>{turn.speaker}</strong>
                        <time>{turn.timestamp}</time>
                      </div>
                      <p>{turn.text}</p>
                    </li>
                  ))}
                </ol>
                <details>
                  <summary>Timestamp and scheduling provenance</summary>
                  <p>
                    Observed source span:{" "}
                    {conversation.observed_span.started_at} to{" "}
                    {conversation.observed_span.ended_at} (
                    {conversation.observed_span.duration_seconds} seconds). This
                    derives from the first and last transcript turns.
                  </p>
                  <p>
                    {conversation.scheduling.interpretation} Mode:{" "}
                    {conversation.scheduling.mode}; seed:{" "}
                    {conversation.scheduling.seed ?? "none"}; algorithm:{" "}
                    {conversation.scheduling.algorithm ?? "none"}. Scheduling is
                    independent of quality scores.
                  </p>
                </details>
              </section>
              <section className="assessment">
                {saved && (
                  <section
                    className="notice saved-observation"
                    aria-label="Saved report observation"
                  >
                    <h3>Saved report observation</h3>
                    <p>
                      Generated: {saved.generatedAt}. Checklist:{" "}
                      {saved.checklistVersionId}.
                    </p>
                    <p>
                      Evaluation: {saved.observation.evaluation_id || "none"}.
                      Revision: {saved.observation.revision || "none"}. Status:{" "}
                      {saved.observation.evaluation_status}.
                    </p>
                    <p>
                      Copied quality score:{" "}
                      {score(saved.observation.final?.final_score)}. Critical
                      flag: {raw(saved.observation.final?.critical_flag)}.
                    </p>
                    {savedCriterion && (
                      <>
                        <p>
                          {metricNames[criterionId]} copied raw value:{" "}
                          {raw(savedCriterion.value)}.{" "}
                          {savedCriterion.rationale}
                        </p>
                        <p>
                          Saved evidence:{" "}
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
                      The saved report remains unchanged until explicitly
                      refreshed.
                    </p>
                  </section>
                )}
                {saved && (
                  <h3>
                    {differs
                      ? "Current values differ from saved report values"
                      : "Current values match saved report values"}
                  </h3>
                )}
                <div className="evaluation-controls">
                  <label>
                    Checklist version
                    <select
                      value={version}
                      onChange={(e) => {
                        setVersion(e.target.value);
                        setOriginal(false);
                      }}
                    >
                      {checklists.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.id})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary"
                    disabled={busy || !!(run && activeRun(run))}
                    onClick={evaluate}
                  >
                    {busy ? "Starting…" : "Evaluate this conversation"}
                  </button>
                  <small>
                    Starts a model assessment using the selected checklist.
                    Existing results remain in history.
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
                    {runError}{" "}
                    <button onClick={() => setRunError("")}>
                      Retry progress
                    </button>
                  </ErrorBox>
                )}
                {!evaluation ? (
                  <Empty>
                    No evaluation exists for this checklist version. Start an
                    evaluation to assess it.
                  </Empty>
                ) : evaluation.status === "error" ? (
                  <ErrorBox>
                    Evaluation failed: {evaluation.error}. No quality score is
                    available.
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
                            ? "Critical violation flagged"
                            : "No critical violation flagged"}
                        </span>
                        <p>
                          Critical is unscored and does not automatically zero
                          the total.
                        </p>
                      </div>
                    </div>
                    <label className="inline-label">
                      <input
                        type="checkbox"
                        checked={original}
                        onChange={(e) => setOriginal(e.target.checked)}
                      />
                      Show original assessment before review
                    </label>
                    <div
                      className="criterion-tabs"
                      role="group"
                      aria-label="Inspect criterion"
                    >
                      <button
                        className={
                          criterionId === "final_score" ? "selected" : ""
                        }
                        onClick={() => setCriterionId("final_score")}
                      >
                        Score calculation
                      </button>
                      {current?.criteria.map((c) => (
                        <button
                          className={
                            criterionId === c.criterion_id ? "selected" : ""
                          }
                          onClick={() => {
                            setCriterionId(c.criterion_id);
                            jump(c.evidence_turns);
                          }}
                          key={c.criterion_id}
                        >
                          {metricNames[c.criterion_id] || c.criterion_id}
                          <span>{raw(c.value)}</span>
                        </button>
                      ))}
                    </div>
                    {criterionId === "final_score" ? (
                      <div className="criterion-detail">
                        <h3>How this score is calculated</h3>
                        <p>
                          Earned points {score(current?.earned_points)} ÷
                          applicable weight {score(current?.applicable_weight)}{" "}
                          × 100 = <strong>{score(current?.final_score)}</strong>
                          .
                        </p>
                        <p>
                          N/A criteria contribute no points and are excluded
                          from applicable weight. The backend normalizes over
                          applicable weight and rounds the total to two decimal
                          places.
                        </p>
                        <table>
                          <thead>
                            <tr>
                              <th>Criterion</th>
                              <th>Raw</th>
                              <th>Points</th>
                              <th>Contribution /100</th>
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
                                      jump(c.evidence_turns);
                                    }}
                                  >
                                    {metricNames[c.criterion_id] ||
                                      c.criterion_id}
                                  </button>
                                </td>
                                <td>{raw(c.value)}</td>
                                <td>
                                  {c.points == null ? "N/A" : score(c.points)}
                                </td>
                                <td>
                                  {c.weighted_score == null
                                    ? "Unscored"
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
                      <summary>Assessment provenance</summary>
                      <p>
                        Checklist: {evaluation.checklist_version_id}
                        <br />
                        Model: {evaluation.model.name} ({evaluation.model.mode})
                        <br />
                        Prompt version: {evaluation.prompt_version}
                        <br />
                        Created: {time(evaluation.created_at)}
                        <br />
                        Assessment: {evaluation.id}
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
          <dt>Raw value</dt>
          <dd>{raw(criterion.value)}</dd>
        </div>
        <div>
          <dt>Maximum</dt>
          <dd>
            {definition.answer_type === "boolean"
              ? "Yes"
              : Math.max(
                  ...(definition.allowed_values.filter(
                    (v) => typeof v === "number",
                  ) as number[]),
                )}
          </dd>
        </div>
        <div>
          <dt>Weight</dt>
          <dd>{definition.weight}</dd>
        </div>
        <div>
          <dt>Weighted contribution</dt>
          <dd>
            {criterion.weighted_score == null
              ? "Unscored / N/A"
              : `${score(criterion.weighted_score)} /100`}
          </dd>
        </div>
      </dl>
      <p>
        {criterion.applicable
          ? "Applicable to this conversation."
          : "Not applicable; excluded from the score denominator."}{" "}
        {definition.allow_na
          ? `N/A condition: ${definition.na_condition}`
          : "N/A is not permitted."}
      </p>
      {Object.keys(definition.scale_meanings || {}).length > 0 && (
        <details>
          <summary>Scoring scale</summary>
          <ul>
            {Object.entries(definition.scale_meanings || {}).map(
              ([value, meaning]) => (
                <li key={value}>
                  <strong>{value}</strong>: {meaning}
                </li>
              ),
            )}
          </ul>
        </details>
      )}
      <blockquote>{criterion.rationale}</blockquote>
      <div className="row">
        <strong>Source evidence</strong>
        {criterion.evidence_turns.map((turn) => (
          <button className="turn-link" key={turn} onClick={() => jump([turn])}>
            Turn #{turn}
          </button>
        ))}
        <button
          className="text-button"
          onClick={() => jump(criterion.evidence_turns)}
        >
          Highlight all evidence
        </button>
      </div>
      <h4>Appeal and review history</h4>
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
        <p className="muted">No appeals for this criterion.</p>
      )}
      {original && (
        <p className="notice">
          You are viewing the original assessment. A new appeal addresses the
          current final value.
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
          Reason for appeal
          <textarea
            required
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Explain the disputed judgment and refer to source turns."
          />
        </label>
        <button disabled={busy || !comment.trim()}>
          {busy ? "Saving…" : "Submit appeal"}
        </button>
      </form>
      {error && <ErrorBox>{error}</ErrorBox>}
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
        <strong>{appeal.status}</strong>
        <time>{time(appeal.created_at)}</time>
      </div>
      <p>{appeal.comment}</p>
      {appeal.decision ? (
        <div className="decision">
          <strong>
            {appeal.decision.action === "change"
              ? `Changed to ${raw(appeal.decision.value)}`
              : `Confirmed ${raw(appeal.decision.value)}`}
          </strong>
          <p>{appeal.decision.reason}</p>
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
            Reviewer decision
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as typeof action)}
            >
              <option value="confirm">Confirm current value</option>
              <option value="change">Change value</option>
            </select>
          </label>
          {action === "change" && (
            <label>
              Reviewed value
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
            Decision reason
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={busy || !reason.trim()}>
            {busy ? "Recording…" : "Record reviewer decision"}
          </button>
        </form>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
    </article>
  );
}
