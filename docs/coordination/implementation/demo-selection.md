# CQA demonstration case selection

Status: exploratory evidence for Task 7, prepared 2026-11-07. These are presentation candidates, not a quality benchmark or acceptance of the model's judgments. No evaluations, source records, scores, or review decisions were changed.

## Provenance and scope

- Read from `/home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026/runtime/cqa.sqlite3` using SQLite URI `mode=ro`; no application imports, jobs, model calls, network access, or audio access.
- Source records: `documents` table, `collection=conversations`, key `id=["DEV","<conversation_id>"]` with compact JSON. Evidence indices are one-based across the full original transcript, including client, bot, and system turns.
- Assessments: `collection=evaluations`, selected strictly by run `34f4496c-876a-4e03-9f6e-72c92d89a556`, rather than by latest evaluation. The database also contains other assessments.
- Run status: completed, 65/65, zero failures; started `2026-11-07T18:17:24.484915+00:00`, finished `2026-11-07T18:20:59.166759+00:00`. All 65 assessment records have status `ok`.
- Recorded model: `{"mode":"external_api","name":"claude-sonnet-5-5"}`. Prompt version: `cqa-assessment-v1`. Checklist version: `cqa-v1`. The usage ledger also records the model as `claude-sonnet-5-5`; an immutable provider build/version was not established.
- Canonical run checklist snapshot SHA-256: `2dc9102ae195a0d96e754b7c70972c0f380cea18a23844a555867f36eef3d974` (JSON with sorted keys and compact separators, UTF-8).
- Selection method: inspect criterion values and denominators for the 65 run assessments, then inspect targeted source turns for the candidates below. The population is 60 agent chats and five voice calls; languages are EN 15, KZ 15, RU 35. This was not a full independent regrading.
- Calendar assignment is simulated demonstration metadata (`assigned_demo`, `stratified-october-v1`, seed 2026, timezone Asia/Almaty), independent of scores. Any October cohort comparison must say that its dates are assigned, not observed history. These cases do not establish a historical trend.

## 1. N/A and effective weight: `DEV / p1-en-001`

English agent chat, 12 turns. Evaluation `3748c5e1-3707-464d-8369-d5181aa3f810`.

The client cannot reuse a login after closing an earlier account. The operator explains the general registration rule and gives a next step. Source anchors: client context at turns 1 and 5, prior clarification at 4, operator answer at 10, client acknowledgement at 11, farewell at 12. Original elapsed timestamps are retained; turn 10 is `01:15` and turn 12 is `02:04`.

The stored assessment makes discovery N/A (weight 15; evidence 1, 4, 5, 10) because the needed context is already available when the human operator answers. Identification is N/A (weight 20; evidence 1, 10) because the operator gives general guidance without a protected disclosure or action. These are clear applicability explanations, rather than a failed verification being excused.

| Criterion | Stored raw result | Base weight | Earned points |
| --- | --- | ---: | ---: |
| Contact | true | 10 | 10 |
| Discovery | N/A | 15 | excluded |
| Identification | N/A | 20 | excluded |
| Consultation | 20/20 | 20 | 20 |
| Empathy | true | 15 | 15 |
| Dialogue | 10/10 | 15 | 15 |
| Closure | false | 5 | 0 |
| Critical flag | false | 0 | 0 |

Applicable weight is `100 - 15 - 20 = 65`; earned points are `60`; total is `60 / 65 × 100 = 92.31`. For example, consultation's base weight 20 becomes `20 / 65 × 100 = 30.7692%` of the applicable total. N/A removes a weight from the denominator; it does not award points. Closure remains a scored failure in this stored assessment.

Why use it: a short English transcript, two understandable N/A conditions, and simple arithmetic. The closure judgment is recorded evidence, not independently endorsed here; keep this demonstration focused on applicability and weighting.

## 2. Plausible appeal: `DEV / p1-en-006`

English agent chat, 30 turns. Evaluation `0bb2c8cc-2891-443d-9932-e5b5cdfeab50`. Original total `90.50`, applicable weight `100`, no critical flag.

Preferred appeal target: consultation, stored `15/20`, evidence turns 16, 21, 23, 26, 28. The stored rationale recognizes an escalation and follow-up path but treats the still-pending transfer and missing timeframe as a reason to withhold full credit.

Source anchors, paraphrased:

- Turns 11–14: verification is requested and the system confirms completion before account investigation proceeds.
- Turn 16 (`04:58`): the operator says the case has been sent for review and an update will arrive in this chat.
- Turns 19–21: the operator collects transfer timing and adds it to the case for the team checking the brokerage side.
- Turn 23: the client is told they can return to the same chat with the details retained.
- Turns 26–28: the operator explains how to download a broker report for a selected period; turn 29 confirms that this worked.
- Turn 30: the operator repeats the transfer follow-up location and closes.

Suggested appeal substance: ask whether the recorded escalation, follow-up channel, continuity explanation, and completed report guidance satisfy the rubric's full-credit allowance for a correct next step, or whether the missing timeframe is a secondary omission that warrants retaining 15. This is a real interpretation question grounded in the evaluated source, not an assertion that the original grade is wrong.

For a review demonstration, either confirm 15 with a specific reason or change to 20 with a specific reason. If only consultation changes to 20, the arithmetic would become `95.50`; this is a hypothetical result, not a saved review. The original record currently equals the final record and has no appeals.

Why use it: the reviewer can explain the boundary between immediate resolution and an adequate next step. Whether the escalation is operationally correct and what response-time commitment is required were not independently verified. Do not script an automatic successful appeal.

## 3. Serious violation: `DEV / p1-en-013`

English agent chat, 14 turns. Evaluation `bec8699a-c475-44a5-9487-d513e58de230`.

The client asks how to find bonds in the app (turns 1 and 5). The operator initially gives navigation guidance (10). At turn 12 (`04:36`), the operator asks for a personal contact number and offers private paid advice after work. The client declines and returns to the app-help request (13); the agent closes the chat (14).

Stored critical result is `true`, evidence turn 12. This matches the saved checklist's explicit category of outside paid services; no client agreement or payment is required for that category. The separately calculated total remains `26.25` (`21 / 80 × 100`); identification is N/A with weight 20. The critical flag has weight zero and does not erase or replace the quality total.

Why use it: the action is explicit, brief, and independent of difficult financial-correctness or identity-verification judgments. Present it as a violation of the saved checklist. No real-world misconduct investigation was performed.

## 4. Small-set custom metric: next-contact ownership in the five calls

Select dataset `DEV`, channel `voice call`, language `RU`; the fixed population is `p4-ru-001`, `p4-ru-002`, `p4-ru-003`, `p4-ru-004`, `p4-ru-005` (n=5). No assigned calendar filter is needed.

Proposed question: who is explicitly expected to initiate the next contact after the call? This separates an operator/team callback promise from an instruction that the client should call again. It can reveal follow-up workload and unclear handoffs without changing the baseline QA total.

Suggested answer domain: `operator_or_team`, `client`, `both`, `not_stated`, `unclear`. Use only an explicit future-contact instruction or commitment in the source. Same-call holds do not count. A contact address alone does not establish ownership. Use `not_stated` when there is no future-contact statement; that value is not by itself a failure. Use `unclear` for conflicting or unintelligible statements, rather than guessing. Return source turns and a short rationale with every answer.

Two source anchors support the usefulness of the distinction:

- `p4-ru-003`, turns 71–73: after escalation to a technical team, the operator promises to call the client; the client confirms who will call. Turns 75–76 continue the follow-up discussion. The exact time wording is garbled, so do not claim a reliable callback deadline from this transcript.
- `p4-ru-005`, turns 49–52 and 73: the operator directs the client to call the support line the next morning; the client confirms that they will initiate contact. This is different from an operator callback promise.

Relevant stored baseline evaluation IDs:

| Conversation | Evaluation in the selected run |
| --- | --- |
| `p4-ru-001` | `20c8fc2e-97a2-4a21-bf19-096d6db79e1d` |
| `p4-ru-002` | `dbb77552-a027-4d3f-babd-8534062df028` |
| `p4-ru-003` | `42c1533b-2edc-4579-8b77-13298c9a32dd` |
| `p4-ru-004` | `4d1a242e-928b-4c4f-b2fa-90b032fca93a` |
| `p4-ru-005` | `d571bfd5-8cfe-4d6d-b153-99d1ccb9a844` |

This metric has not been evaluated or persisted. The two anchors are source observations, not a five-call result distribution. A later genuine custom run must record its own definition/version, model/run identity, per-call answer, evidence, and complete/pending/failed counts. Show counts out of the selected five; if expressing a proportion, state its eligible denominator and treatment of `not_stated`/`unclear`.

## Remaining checks and presentation choice

Use case 1 for the short explanation, case 2 for review, and case 3 only if the serious-violation distinction fits the five-minute script. Case 4 is the custom-metric scenario. All selected baseline records currently have no appeals and identical original/final assessment objects.

Not checked: application/UI availability, evidence-navigation rendering, review persistence/recalculation, checklist-change execution, a live custom-metric run, audio/transcript fidelity, financial-policy correctness, complete source regrading, model accuracy, or a timed rehearsal. No raw transcript text, recording URLs, credentials, or personal contact details are included in this report.
