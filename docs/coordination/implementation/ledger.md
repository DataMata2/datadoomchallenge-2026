# Implementation ledger

Plan: `docs/superpowers/plans/2026-11-07-cqa-prototype.md`.
Coordinator: overseer. Design confirmed; implementation explicitly authorized.
Original project: `/home/datamata/Projects/hackathons/datadoomchallenge-2026`.
Active native worktree: `/home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026`.
Implementation branch: `feat/cqa-prototype` (creation pending at ledger initialization).
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
| 1 | Pending | Ready | Pending | None |
| 2 | Pending | Queued | Pending | Task 1 |
| 3 | Pending | Queued | Pending | Task 2 |
| 4 | Pending | Queued | Pending | Task 3 |
| 5 | Pending | Queued | Pending | Task 4 |
| 6 | Pending | Queued | Pending | Task 5 |
| 7 | Pending | Queued | Pending | Task 6; actual control group not released |

## Release boundaries

- API cap USD 100; working allowance USD 80, control/recovery reserve USD 20.
- Deadline 2026-11-08 12:00 Asia/Almaty.
- GitHub PRIVATE; no authority to change public visibility. Future public organizer submission requires explicit user instruction.
- Original local `.env` and DEV evidence stay outside Git. Active worktree is isolated; locate original source paths explicitly.
