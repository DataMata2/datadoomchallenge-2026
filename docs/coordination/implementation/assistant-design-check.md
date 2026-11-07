# Task 5 assistant design check

Recommendation for `feat/cqa-prototype` in `/home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026`. This is a bounded design check, not a review of Task 4's live diff.

Evidence: confirmed product design §§Product surfaces/Analysis reports; plan Global Constraints and Task 5; published contract lines 86–100; `analytics_models.py:23–91,155–164`; `reports.py:15–52`; `provider.py:19–35,124–146`; `jobs.py:32–103`; `main.py:34–51`; `models.py:304–327`; `storage.py:58–77`.

## Action interface

Use one strict discriminated JSON union: `update_analysis {patch, explanation}`, `add_metric {definition, explanation}`, or `clarify {question, explanation}`. Forbid extra fields throughout. Do not permit SQL, code, tools, URLs, or model-selected conversation IDs. Validate dataset existence, baseline metric IDs, definition IDs and the complete resulting spec before selection, mutation, or job creation. Compute figures through analytics only.

Define dedicated optional-field patch models. Omitted fields preserve context; explicit `null` clears nullable predicates or cohorts. Apply `model_dump(exclude_unset=True)` recursively to filters; ordinary default-filled dumps would erase prior constraints. Treat `hours` as a complete replacement or null, and cohorts/metric lists as complete replacements. Nonnullable dataset/title/grouping/metric lists require explicit valid values; clearing grouping means `"none"`. Revalidate the merged `AnalysisSpec`, including interval bounds, strict booleans/numbers, nonempty metric lists, unique cohort keys, and cohorts requiring grouping none. Preserve global/cohort AND semantics and legitimate empty intersections.

Supply canonical current state, bounded message history, available datasets/date coverage, calendar/timezone and current Almaty date to the shared provider. Transcript text remains untrusted data. Persist user/assistant messages and useful errors; never present model-generated figures as computed results.

## Initial clarification

Recommend persisted drafts over frontend-seeded analyses. Extend `Report` with `status: draft|ready`, nullable spec/output, and the invariant that drafts have both null while ready reports have both populated. Treat legacy populated reports as ready. Persist the draft and first message before translation; clarification returns its report ID and null spec/output. A valid complete action calculates and commits ready spec/output together. Existing ready reports retain their saved analysis on clarification/provider failure. Draft reads have `stale=false`; refresh/metric creation reject drafts explicitly.

A frontend seed would invent scope/output and move conversation ownership into every client. Current `{content, report_id?}` requests cannot otherwise recover an initial clarification after reopening. Publish the small schema extension, examples and OpenAPI for the teammate in this same repository.

## Independent metric jobs

Extend the existing application-owned `JobManager` with kind-specific assessment/result handlers. Keep its single startup/recovery/close owner and existing shared `ModelClient`, budget, cancellation context and two-request semaphore. A second manager would scan all active runs during its first startup and could interrupt live base evaluations (`jobs.py:42`).

Expose a discriminated run contract: preserve evaluation fields; custom runs carry report ID, immutable metric snapshot, saved dataset/root IDs and selection provenance, with null checklist fields and a separate `assessment_id` rather than misleading `evaluation_id`. Persist judgments, evidence, model/prompt identity and usage-attempt IDs in a separate collection. Never write regular evaluations or invoke baseline scoring for a metric.

Atomically register the queued run and typed report-metric entry in a short local transaction, then call duplicate-safe `jobs.dispatch(run_id)`. Registration failure must send nothing. Empty selections fail before dispatch. Recovery reconciles durable results by run kind, interrupts unfinished work without resending, and retains unknown reservations. Cancellation retains completed/in-flight paid results and visible partial/error counts; retries create explicit new runs.

Definitions require strict boolean or finite discrete numeric domains, immutable IDs, and `na_condition` iff `allow_na=true`. Reject baseline/reserved IDs (including `final_score`) and report-local duplicates. Validate exact allowed values, distinguishing false from zero, plus nonempty unique in-range one-based evidence. Boolean aggregates use applicable true-rate; numeric aggregates use raw-scale means/distributions, with explicit applicable/N/A/failure/pending denominators.

Coverage is dataset plus immutable source IDs and definition identity. Preserve old run provenance on report changes; aggregate only current saved group/root intersections, expose uncovered/out-of-scope counts, and never silently rerun. Unchanged compatible selections retain results; dataset changes cannot reuse them.

## Checks and limits

Edge tests: language-only follow-up preserves dates; null clears; invalid nested keys/cohorts/IDs cause no execution; initial clarify/reopen; registration/dispatch failures; duplicate dispatch; cancellation/restart around durable-result writes; active base run survives metric setup; changed/empty/overlapping selections; false/zero/N/A/domain/evidence errors; byte-equivalent baseline evaluations and export before/after metrics.

Parent-verified smoke context: DEV voice-call/RU selection has five records, saved report `23eedbe6-7107-48a9-82e0-62d01b4c9745`; “sample5calls” is not a dataset ID. Actual readiness remains parent-provided. No code, DB, credentials, network/model calls, installs, Git writes or runtime tests were performed. Provider semantic quality and final Task 4 integration remain unverified.
