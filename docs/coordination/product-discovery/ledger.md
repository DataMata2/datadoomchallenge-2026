# Product discovery ledger

Coordinator: overseer (`01a1b5e0-8d65-7993-9c28-e8d6b86e283e`).
Date: 2026-11-07. Current stage: user-requested design interview.
Source requirements: `../materials-review/briefing.md`.

## User intent and ownership

- Optimize for an impressive live demonstration within the mandatory CQA requirements.
- Proposed additions: daily overview; conversation filtering by time, channel/type, date, and related conditions; natural-language assistance to construct complex filters; instructions for further analysis and comparisons across selected cohorts.
- Claude/local comparison is presentation-only evidence, explicitly excluded from the product workflow. User reports adding Claude configuration to local `.env`; credential values must not enter reports or chat.
- Overseer coordinates backend and functional frontend prototype implementation through workers and SDD review. Teammate owns final UI design/implementation. Exact integration contract remains to be agreed.
- User explicitly requested grilling before choosing the design. Round 1 decisions below are settled; remaining product questions and architecture are open.

## Settled decisions: interview round 1

- Demonstration leads with natural-language discovery of an operational issue, followed by source evidence and human review. Transparency is a central product objective.
- User proposed an inspection marker next to metrics to explain how each was obtained. Implementation interpretation for further design: expose definitions, inputs, arithmetic, applicability, and supporting transcript evidence; exact component remains a UI choice.
- Existing-score comparisons should be fast; genuinely new assessment instructions start a separate evaluation run with visible progress.
- User additionally wants custom metrics to appear naturally in the resulting analysis document. Meaning of document and effect on official QA score remain open.
- On-stage plan: live filtering and analysis over prepared evaluations, one fresh evaluation, and available saved results for service failure.
- Cloud/local comparison is prepared separately for the presentation. Do not add automatic dual-model processing, a comparison screen, or model-comparison product configuration.
- Teammate will produce a frontend independently; adapt it to the backend if it differs from the functional prototype. A shared frontend implementation was not agreed.
- User states deadline is tomorrow at noon; interpreted from current date/timezone as 2026-11-08 12:00 Asia/Almaty (UTC+05:00). Calendar time interpretation was communicated to the user.
- API spending cap: USD 100. This authorizes project cloud model use within the cap; no inference spend has occurred. Track measured usage and retain a budget reserve for control data.
- Explain integration as a backend that the teammate can call for conversations, evaluations, and results. API contract/examples should be delivered early; an exact milestone has not been specified.

## Settled decisions: interview round 2

- Calendar demonstration: user authorizes attaching random dates to the data. Preserve organizer timestamps and record IDs; store assigned calendar scheduling as separate demo metadata. Default interpretation is a reproducible assignment independent of model scores, with visible provenance so assigned dates are not represented as observed history.
- Analysis document: user accepts a saved analysis page next to the assistant conversation, with the question, applied filters, charts, findings, and custom metrics. Follow-up instructions update the report; charts link to underlying conversations. Downloadable export follows the core workflow if time permits.
- Custom metrics are analysis additions and must not affect the regular quality score. The separate required checklist-editing workflow still operates on explicit checklist versions.
- Presentation deployment: user's laptop. Produce a straightforward local startup; frontend/backend interface should permit later deployment elsewhere without requiring hosting for this presentation.
- Conversation "type" means the organizer API `channel` field: `agent chat` or `voice call`. User explicitly clarified this with the DEV endpoint. Business-topic classification is not part of the initial scope.

## Final interview consolidation

- User confirmed the consolidated design ("yeah this does it") and explicitly instructed implementation to start. No further scope confirmation is required.
- User explicitly requested a PRIVATE GitHub repository via gh and collaborator access for teammate identified as gojosatoru. Keep the repository private; any later public submission requires a separate user decision.

- All user-owned product questions raised in the interview are answered. Consolidated design is in `product-design.md`; shared-understanding confirmation is the remaining interview checkpoint before implementation.
- Treat the organizer URL supplied again by the user as the same DEV source already inspected. Do not echo the signed URL or make a redundant request.
- Default reporting timezone is Asia/Almaty. Proposed engineering default for holiday queries is a Kazakhstan calendar with visible interpretation; calendar implementation and source verification remain part of implementation planning.
- Required next work after design confirmation: implementation plan, bounded worker briefs and ownership, early API contract/examples for independent frontend development, serial implementation tasks with SDD reviews, and presentation rehearsal/submission gates.

## Design tree

1. Primary demonstration outcome -> main actor/story -> screen sequence and five-minute script.
2. Analysis instruction semantics -> existing-metric queries versus new evaluation -> task contracts and progress UI.
3. Live-operation and failure expectations -> precomputed evaluations/live queries -> fallback behavior.
4. Purpose of cloud/local comparison -> evidence, agreement, latency/cost measurements -> evaluation plan.
5. Team interface and schedule -> API/schema freeze and fixtures -> parallel UI/backend workstreams.
6. Event deadline and spend limit -> scope/resource allocation -> delivery milestones.
7. Verified source metadata -> decision on calendar demonstration data -> feasible cohort filters and explicit provenance.
8. Verified environment inventory -> establish local execution -> presentation-only measurement and deployment decisions.

## Bounded fact-finding

| Worker | Owned report | Status | Limits |
| --- | --- | --- | --- |
| `/root/data_feasibility` | `data-feasibility.md` | Complete; reviewed | Organizer DEV read-only; no external inference; do not expose signed URL or transcript content in report |
| `/root/runtime_feasibility` | `runtime-feasibility.md` | Complete; reviewed | Local read-only inspection; credential names/presence only; no inference, downloads, installations, or significant allocation |

Both workers routed questions to the overseer and did not dispatch subagents. No usable Git repository or application code exists. No implementation has started.

## Verified discovery and implications

- Organizer DEV GET succeeded via standard approved sandbox escalation for the original read-only request. No approval rejection occurred; no signed URL was exposed.
- Overseer read both reports and independently inspected raw response structure with a metadata-only script: 65 records, 60 chats/5 calls, exactly the documented five record keys, all chat timestamps elapsed, all five call start dates 2026-11-03. Thus supplied DEV cannot support an actual month-start/month-end or cross-date trend comparison. It also has no operator identity metadata.
- Calendar demo needs an explicit user decision: use genuine supported cohorts only, or a separately identified simulation/demo dataset. Do not silently assign historical dates to official records or claim synthetic trends are real.
- Overseer independently verified `.env` has one noncomment line and zero conventional assignments. Credential format needs normalization before first model call; values were neither printed nor persisted. A plausible key exists, but validity/model access remains untested.
- Runtime report identifies cached Qwen2.5 1.5B weights; runnable inference, GPU access, quality, and latency remain unverified. Local comparison is conditional on establishing execution and measuring it. No inference packages were installed or models loaded.

## Next checkpoint

Create and execute the implementation plan under the user's explicit start instruction. Preserve mandatory eight-ID submission exports independently of analysis metrics unless organizers change that contract.
