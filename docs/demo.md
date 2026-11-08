# Server demonstration and delivery

## Current server handoff — 2026-11-08

The private demonstration is live at **https://incode.kz:8443** with valid TLS and
whole-site authentication. The official team name is **404 Dauren Not Found**.
Credentials are recorded only in the ignored private `runtime/deploy/access.txt`;
keep their values and password hash out of source and shared logs. The GitHub
repository is now public at the user's request. The deployed website still requires
a login; public data/API access is pending the approval-review escalation. `freedom.incode.kz` DNS is currently unresolved; use the fallback.

The sole canonical database is
`89.126.193.108:/home/ubuntu/cqa/runtime/cqa.sqlite3`, owned by the single
`cqa-api` container. The local API/Vite owner is stopped and the former local
ledger is a mode-0440 archive. **Do not restart the old local owner, restore that
archive, or create a second live ledger.** Server release `9ded72e` is deployed,
including the final Freedom design changes; later documentation-only commits do
not imply another runtime release.

The verified cutover snapshot contains 78 conversations (DEV 65, FBroker 10,
Swap 3), 144 evaluations, 5 custom assessments, 5 reports, 6 runs and the unchanged
single `cqa-v1` checklist. DEV is 65/65 valid Russian baseline results in
`results/dev/results.json`; the primary FBroker control is 10/10 valid Russian
baseline results in `results/prod/results.json`. Swap is stored **ungraded**.
Recorded usage is **157 attempts / USD 2.409826 / zero reserved**. These are recorded
usage calculations, not invoice reconciliation. The full database logical hash
remained unchanged after startup:
`0c63e746fdc86b0fc753bba1ca4294cbfd7964890a037eb22cd56c47573246cf`.

Both private HTTP80 and fallback TLS443 routes were checked: missing/invalid
authentication returned 401 and valid authentication returned 200. Static assets,
deep SPA routes and migrated data integrity were checked. Browser visual and
interaction QA remains unavailable; HTTP/build checks do not establish it.

## Russian interface and analysis-language setup

1. Open the deployed app at `https://incode.kz:8443` using the privately delivered credentials. Navigation is **Обзор**, **Ассистент и отчёты**, **Чек-листы**, **Настройки**. The layout and workflows retain the teammate's visual design.
2. In **Настройки**, verify **Язык анализа** is **Русский (RU)**. Choose **Сохранить настройки** only when changing it. The preference is stored on the server, with explicit loading/saving/success/error states. Saving does not run a model, translate history or change the language of queued runs. **Язык диалога** in **Обзор** is a separate source-language filter.
3. Open an assessment's **Происхождение оценки** and inspect **Язык анализа**. Run progress and assistant messages also show their recorded language. Older records without metadata are honestly labeled **Английский (EN)**. Source transcripts and saved/model/user text stay in their original language.
4. For a new authorized assistant demonstration, use a Russian prompt with an explicit period, for example: «Сравни качество чатов DEV за первую и вторую половину октября 2026 года. Покажи оценку качества, ведение диалога и критические нарушения». Follow up: «Оставь только русскоязычные диалоги. Сохрани период, канал и сравнение». The interface also provides Russian prompt suggestions.
5. Russian DEV and FBroker baseline preparation and export validation are complete. For a read-only walkthrough, select DEV or FBroker, open a stored latest RU assessment, inspect source evidence and provenance, and reopen a saved report without refreshing it. Swap is stored but ungraded. The overseer coordinates any new model request, explicit saved-report refresh or export change. Use the newest evidence in the [coordination ledger](coordination/implementation/ledger.md); a fresh evaluation can change judgments. Historical English scores below are not a translation-equivalence assertion.

## Historical English preparation — provenance only, do not replay

The following IDs, scores and report snapshots describe the retained English preparation before the separately authorized Russian run. They remain useful provenance and must not be silently replaced in place. Confirm current/latest output through its recorded evaluation and language metadata.

1. The former local UI at `http://127.0.0.1:5173` was used before cutover; it must remain stopped. **Обзор** selects DEV and October 2026 in Asia/Almaty. Inspect the visible filter interpretation, eligible denominator and group selector. Read-only HTTP verification observed 65 selected/evaluated, zero failed/unevaluated. Across all channels, assigned day has n=32 and mean 67.29; assigned night has n=33 and mean 71.07. These are descriptive demo cohorts.
2. In **Ассистент и отчёты**, reopen `7a44d2a6-5c5d-48f2-87cc-bbb7a1397299` (October agent-chat month-half comparison, 60 conversations). This is retained prepared output, not evidence that a new assistant request succeeded. Inspect a metric and its source row/evidence link. Saved drilldown retains copied value, rationale, evidence, evaluation ID, revision, checklist and generated-at provenance; the drawer labels differing current values without claiming revision equality. Refresh is explicit.
3. Open DEV `p1-en-001`, evaluation `3748c5e1-3707-464d-8369-d5181aa3f810`. Discovery and identification are N/A, so applicable weight is 65; earned points 60 produce 92.31. Evidence uses every original transcript turn, including nonoperator turns. Inspect the raw/maximum/weight explanation and original/final toggle.
4. Open DEV `p1-en-013`, evaluation `bec8699a-c475-44a5-9487-d513e58de230`. Critical is true with source turn 12; the arithmetic total remains 26.25. The critical flag is unscored and independent.
5. Open DEV `p1-en-006`, evaluation `0bb2c8cc-2891-443d-9932-e5b5cdfeab50`. Consultation is 15/20, total 90.50. Source turns 16, 21, 23, 26, 28 and 30 support an escalation, follow-up location and report instructions. Read the existing rationale before any review. Coordinator demo appeal `22bcb06a-86d4-43ba-aee5-4602df81d862` confirmed consultation 15 and retained original/final 90.50. Its reason cites observable escalation/follow-up/report guidance while noting that supplied materials do not verify full operational resolution; it assumes no SLA or extra policy and makes no grading-accuracy claim. This is a coordinator demonstration review, not independently certified human grading. The agent-chat report became stale from the changed appeal-history revision and was explicitly refreshed; its new generated-at is `2026-11-07T21:36:19.168558+00:00`. Export bytes were unchanged.
6. Historical export validation confirmed the regular baseline; do not rerun the old local workflow. The existing DEV file contains all 65 IDs exactly once, exactly eight required criteria per successful record, actual model identity and team name `404 Dauren Not Found`, and no full transcripts or recording links.

The five-call report `23eedbe6-7107-48a9-82e0-62d01b4c9745` selects DEV / voice call / RU, n=5. At this historical checkpoint no real custom metric run existed. The current server snapshot instead retains five custom assessments; inspect their recorded provenance without treating this older report description as current coverage.

## Historical provider checks and model-action examples

The user explicitly authorized all 65 existing DEV conversations and derived report context for Russian regeneration and assistant testing through Anthropic/Claude within the USD 100 budget. The overseer coordinates the exact reviewed requests through the sole existing API owner and canonical ledger. This UI task does not itself start provider work. The earlier private Task 5 smoke was not retried at that historical checkpoint; read the current ledger for subsequent authorized outcomes. That checkpoint preceded the completed FBroker control preparation. GitHub publication is now explicitly authorized and the repository is public. Website authentication remains enabled pending resolution of the public-data access approval.

Wholly manufactured native-schema checks recorded five explicitly reviewed requests. The first two assistant actions were rejected with HTTP 400 because the transmitted schema exceeded provider complexity limits; the custom boolean judgment was accepted. A compact transport fix keeps the complete typed target/mask checks and passed two corrected assistant probes: an initial October report and an English-only follow-up retaining its period with exactly `filters.language` in the mask. All attempts remain in canonical billing. Added measured cost was USD 0.032006, bringing the historical pre-Russian-preparation usage snapshot to 73 attempts / USD 1.061508 / zero reservations. These checks used fixed invented contexts, not a real DEV report or a persistent live conversation; they establish native-schema/contract acceptance, not DEV accuracy or completion of the five-call metric.

These are scoped demo requests to coordinate through the overseer; their text alone is not proof of a successful live outcome:

- Initial: “For DEV agent chats in October 2026, compare the first and second half of the month. Show quality score, dialogue and critical violations.”
- Follow-up: “Show only Russian conversations. Keep the same period, channel and comparison.”
- Five-call custom metric: use the retained RU voice-call report, with boolean **Explicit operator/team follow-up**: true when an operator/team explicitly commits to initiating future contact; false when future contact is explicitly client-led; N/A when no future-contact instruction/commitment exists. Same-call holds do not count. Every judgment needs one-based full-transcript evidence. False is descriptive and is not automatically poor quality.
- Checklist: use **Добавить критерий**, or remove a draft criterion and add its replacement with a new valid unique ID. Set its wording, type, weight and applicable scale/N/A settings, save a distinct immutable version, select the returned version in `p1-en-001`, then explicitly evaluate only that conversation after authorization. Preserve cqa-v1 results/export. No changed checklist or fresh real assessment was created in Task 7.
- Review: submit an appeal with actual source turns and rationale, then enter the reviewer’s source-grounded decision. A confirmation is valid. Do not invent an override or a business policy for a score animation.

CUA navigation/DOM/screenshot failures (`undefined timeoutMs`) prevented browser visual QA. HTTP 200, synthetic DOM tests and compilation do not establish rendered browser behavior; no screenshot is claimed. The [local-model comparison](presentation-model-comparison.md) records the initial import failure, corrected setup and five measured outcomes: four strict successes, one incomplete criterion set and a source-grounded missed critical flag. Keep it separate from product evaluations.

## Current delivery and safe operations

The real primary control is **FBroker**, with all ten Russian baseline assessments
validated in `results/prod/results.json`; DEV has all 65 validated Russian
baselines in `results/dev/results.json`. Both use the exact team name
`404 Dauren Not Found`. The former “control unavailable” instructions and local
import/evaluate/resume/export command sequence are retired. Do not replay them,
reimport these sources, resend assessments or restart the old local owner.

The sole live ledger is `/home/ubuntu/cqa/runtime/cqa.sqlite3` on
`89.126.193.108`; the old local mode-0440 database is only an archive. Any future
export validation must use a current read-only snapshot of the server ledger,
not the stale local archive. Deployment, backup and rollback instructions are in
[the deployment runbook](deployment.md). Keep every usage attempt and reservation
when changing ownership or source releases.

For the current demonstration, use authenticated read-only UI/API inspection.
Opening a saved report or assessment does not require a new provider call. A new
assistant message, custom-metric run or checklist evaluation is a new explicit
action; coordinate it through the overseer and inspect its durable run/usage
before any retry. A cancelled/interrupted run, missing evaluation or unknown
dispatch outcome must be investigated without automatic resending. Only reviewed
final source/artifacts are published to the public repository by the overseer.
