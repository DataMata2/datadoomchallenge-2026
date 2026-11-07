# Implementation ledger

Plan: `docs/superpowers/plans/2026-11-07-cqa-prototype.md`.
Coordinator: overseer. Design confirmed; implementation explicitly authorized.
Original project: `/home/datamata/Projects/hackathons/datadoomchallenge-2026`.
Active native worktree: `/home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026`.
Implementation branch: `feat/cqa-prototype` (active native worktree).
Baseline: `b4505aa`, pushed to private `DataMata2/datadoomchallenge-2026` main.
Teammate: verified `gojosatorukz`; write invitation ID 342141336 pending acceptance.

## Execution and review constraints

One implementation worker at a time; parent dispatches a fresh task reviewer, reads the actual diff, and verifies material claims. At most three workers total. No nested delegation. All worker questions route to overseer. Use ordinary approved sandbox escalation for writes in the native worktree, which is outside the original writable root; never bypass a rejection.

## Plan self-review and preflight

| Task | Internal consistency / spec coverage |
| --- | --- |
| 1 | Source immutability, strict values/evidence, rubric/N/A arithmetic and durable import/read API; contract docs explicitly distinguish future endpoints. No paid calls. |
| 2 | Uses Task 1 store/checklist/scoring; strict structured model output, usage/reservations, persistent progress and real DEV preparation. No model-comparison feature. |
| 3 | Uses evaluated snapshot; preserves original/review history; baseline export fixed to eight IDs and exact counts; checklist replacement remains versioned. |
| 4 | Uses separate demo dates, final reviewed scores and explicit eligible denominators; saved numerical output is computed locally. |
| 5 | Uses Task 4 reports and Task 2 provider/jobs; validated action plans; report metrics stored separately and cannot modify official totals. |
| 6 | Consumes published contract; implements required UI and assistant/report interaction; teammate UI remains independently replaceable. |
| 7 | Integrates actual workflows and measured presentation experiment; no invented control records; private repo and user-only public release gate preserved. |

| Shared interface/files | Producer -> consumer | Check / ruling |
| --- | --- | --- |
| Store and domain/read API | 1 -> 2,3,4,5,6 | Stable Store signatures and `/api` resource/list contracts specified. |
| Checklist snapshot / scoring | 1 -> 2,3,4 | Model never computes official arithmetic; reviews retain evaluated snapshot. |
| Provider, budget, jobs | 2 -> 5,7 | Shared attempt accounting; metrics and presentation calls remain measured. |
| Evaluation final state | 2,3 -> 4,5,6 | Analytics use reviewed final values; original remains immutable. |
| Report/filter/action schema | 4 -> 5,6 | Strict allowlist; no generated SQL/code. Custom metric assessments stay separate. |
| API docs/OpenAPI | 1 then 2-5 -> 6 and teammate | Every task updates contract with actual implemented routes. |
| README/config/scripts | 1,2 -> 6,7 | Secret/env normalization is local; startup imports use explicit paths; no raw data in Git. |
| Lockfiles/dependencies | 1 -> 2,4,6,7 | Serialize implementation installs and heavy jobs; pin resolved versions. |

Ruling: one integrated plan is appropriate because the report/assistant/frontend depend on the same scoring, versions, and API contracts. Tasks are independently testable review gates; optional hosted deployment and visual redesign are excluded.

## Task status

| Task | Worker | Status | Commit/review | Blockers |
| --- | --- | --- | --- | --- |
| 1 | `/root/task1_foundation`; reviewer `/root/task1_review` | Complete | `442238c..0a22cd7`; review approved | Minor Meta note deferred to Task 4 |
| 2 | `/root/task2_evaluation`; reviewer `/root/task2_review` | Complete after fix round 1 | `7092424..ed24562`; scoped re-review approved | None |
| 3 | `/root/task3_workflows`; reviewer `/root/task3_review` | Complete after fix round 1 | `8edcf84..a264d45`; scoped re-review approved | Minor OpenAPI note deferred to Task 4 |
| 4 | Pending | Queued | Pending | Task 3 |
| 5 | Pending | Queued | Pending | Task 4 |
| 6 | Pending | Queued | Pending | Task 5 |
| 7 | Pending | Queued | Pending | Task 6; actual control group not released |

## Release boundaries

- API cap USD 100; working allowance USD 80, control/recovery reserve USD 20.
- Deadline 2026-11-08 12:00 Asia/Almaty.
- GitHub PRIVATE; no authority to change public visibility. Future public organizer submission requires explicit user instruction.
- Original local `.env` and DEV evidence stay outside Git. Active worktree is isolated; locate original source paths explicitly.

## Task 1 verified completion

Task 1: complete (commits 442238c..0a22cd7, spec compliant and task quality approved). Parent read the implementation/test/contract diffs, independently ran the full locked Python 3.12 suite (46 passed in 0.38s), verified all 65 raw source records against persisted records without printing content, and compared generated OpenAPI to the live app. Original checklist wording/applicability/weights were compared to the previously read authoritative checklist; rubric translation is consistent. GitHub privacy verified separately.

Task 1: minor (deferred to Task 4): `/api/meta` describes default assigned scheduling even for source-only import. Per-conversation provenance is correct. Fix summary when analytics metadata becomes dataset-aware, with a focused source-only/mixed-state test.

Ruling: implement cancellation with Task 2 JobManager rather than waiting for the Task 5 consumer. Keep the already documented route and shape. Contract hour/daypart/refresh semantics are accepted as explicit elaborations of the spec. Latest-evaluation references must not mutate immutable source records. Decimal final rounding uses ROUND_HALF_UP, an explicit engineering convention where source tie behavior is unspecified.

Task 2: dispatched `/root/task2_evaluation`; BASE 709242497b7b9fe41b6bcb0f991d2c152f6dd6a8. Foundation and API contract pushed to private feature branch.
Ruling: canonical checkout-local model-job flock is `runtime/model-jobs.lock`, overridable via CQA_MODEL_LOCK. It coordinates this active project checkout, not other host projects. Real smoke/bulk and later local-model jobs use it; lightweight offline tests need not. No model job has started yet.

## Task 2 verified completion

Task 2: fix round 1/5 (2 addressed, 0 open; commits b2ebc79..ed24562). Review confirmed a preparation dispatch-before-marker gap and destructive unrelated env normalization. Fix persists marker before duplicate-safe dispatch and refuses unrelated settings before mutation. Scoped re-review approved both findings with no new issues. Parent read implementation/fix diffs and independently ran the final locked offline suite: 75 passed in 1.61s.

Task 2: complete (commits 7092424..ed24562, review approved). Parent independently read the real run/source/usage database without printing content: DEV run 34f4496c-876a-4e03-9f6e-72c92d89a556 is 65/65, all original source fields preserved, all stored original/final scores recomputed; 8 critical flags, scores 12.5–100.0. Smoke run 3e4718cc-8bb2-4b10-8dfc-7a6a21b61f54 is RU/KZ/EN 3/3, measured USD0.041122. Total68 attempts USD1.029502, outstanding reservations0. Exact model claude-sonnet-5-5. No new paid calls or real env migration occurred in fix round. Human grading accuracy remains unverified.

Coordinator questions pending asynchronously: teammate frontend branch/repository; official team_name for export. Neither blocks implementation. Final submission files must use the actual team name; do not invent one. Until provided, validate export code and real DEV structure in memory with explicitly synthetic metadata rather than tracking a misleading official file.

Task 3: dispatched `/root/task3_workflows`; BASE8edcf849b68c4b7c3dea932272029f2fd07f2d8c. Reviewed engine+contract pushed privately.

Demo-case discovery: `/root/demo_case_selection` returned exploratory cases in demo-selection.md. Parent independently inspected targeted source turns for p1-en-001 (general login guidance; N/A demonstration), p1-en-006 (escalation/follow-up plus successful report guidance; plausible consultation review), and p1-en-013 (explicit outside paid advice at turn12). Cases are source-grounded; consultation/SLA correctness remains an interpretation, not an accuracy benchmark.
Ruling: categorical next-contact ownership proposed by discovery is exploratory only. Initial custom metric contract remains boolean/discrete numeric; use an operator-led-follow-up boolean with explicit N/A conditions if choosing that demo, and do not imply client-led contact is automatically poor quality. No custom metric has been run yet.

Task 4 interface ruling: original user examples include arbitrary start/end windows and day/night comparison. Add optional typed comparison cohorts (global predicates intersected with each cohort), plus day_night grouping; keep existing simple group_by contracts and baseline arithmetic. No generated SQL or model-produced aggregates. This implements the agreed comparisons rather than silently approximating every request as month halves. Conditions/denominators remain inspectable.

Task 4 transparency ruling: saved report IDs alone are insufficient because an evaluation final value can change after appeal. Store final-value observations/revisions with report output; compute a nonmutating stale indicator and refresh explicitly. This also supplies the exact per-conversation inputs behind aggregate metric inspection. Report/custom-metric updates must preserve snapshot provenance and coverage.

## Task 3 verified completion and user handoff

Task 3: fix round 1/5 (1 Important addressed,0open; commits480dd2b..a264d45). Combined finite weights could overflow aggregate float outputs; shared aggregate validation now rejects this before version creation and direct scoring. Valid large values, NA and critical semantics retain coverage. Scoped re-review approved. Parent read the implementation/fix diffs and independently ran the final suite:143 passed in3.77s.
Task 3: complete (commits8edcf84..a264d45, review approved). Parent independently validated actual results/dev/results.json against read-only DEV sources:65ok records, exactly8criteria each, exact team_name404 Dauren Not Found, actual external_api/claude-sonnet-5-5,8critical flags, recomputed totals, no transcript/audio fields. Artifact remained uncommitted until this reviewed gate.
Task 3: minor (deferred to Task 4): generated OpenAPI union-number bounds use ignored ge/le keywords; emit standard minimum/maximum and test Draft202012 rejection of invalid boundary samples. Runtime validation currently works.

User answered coordination questions: frontend work will be in this same GitHub repository; watch for his branch rather than another repo. Official team_name is exactly404 Dauren Not Found. At the latest GitHub check, gojosatorukz write invitation remained pending and effective permission was none; recipient must accept. Branches were main and feat/cqa-prototype. User was given the invitation URL and suggested a frontend branch; no external message was sent.
