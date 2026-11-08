# Russian Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the teammate's frontend in Russian for the judges, with a persistent analysis-language setting that controls future baseline, custom-metric and assistant output.

**Architecture:** Preserve the current FastAPI/SQLite and redesigned React client. Add one workspace language preference and capture its effective value on each new run/message, independently of source language. Localize product UI through explicit Russian display helpers; keep source transcripts, canonical IDs, immutable checklist/evaluation history and scoring unchanged.

**Tech Stack:** Existing Python3.12/FastAPI/Pydantic/SQLite and React/TypeScript/Vite; no new dependency or hosted service.

**Spec:** User request2026-11-08: teammate frontend is pushed; analysis language should be configurable in settings; the whole demo should be Russian because judges speak Russian. This plan records the concrete product decisions. Prior product/scoring constraints remain in docs/coordination/product-discovery/product-design.md and docs/coordination/materials-review/briefing.md.

## Global Constraints

- Do not dispatch subagents. Do the work yourself and report back. All questions/blockers go to root, never the user.
- Standard technical English for code/comments/commits/reports; Russian for visible product text. Keep the teammate's layout and existing behaviors.
- Repo PRIVATE. No credentials, signed URLs, source payloads, runtime/evidence or model artifacts in Git. Original source IDs/text/turn order/timestamps remain unchanged.
- Default analysis language RU; allowed values exactly RU, KZ, EN. Source-language filters remain independent. Settings are durable server workspace state, not only browser storage.
- GET /api/settings and POST /api/settings use WorkspaceSettings exactly {analysis_language: Language}; unknown/invalid fields reject422. No network/provider call on read/save/startup.
- Snapshot language on new baseline/custom runs and assistant messages; changing the setting never changes queued-run language or silently rewrites/reruns existing results. Legacy model-authored records are EN when no language field exists. Expose honest provenance.
- Preserve original evaluations, appeals, checklist cqa-v1 and report snapshots. Do not translate immutable rubric.py in place; it is inserted with immutable equality at startup. Use display mappings for canonical built-in labels.
- All scores/denominators/critical/N/A/evidence/export rules stay unchanged; custom metrics never alter regular scores/export. No free-form code/SQL. Preserve compact native assistant schema and full local validation.
- One live API owner; existing owner838143/backend838158/Vite838208/session69818 stays running until parent coordinates one restart. Canonical active runtime/cqa.sqlite3 and runtime/model-jobs.lock remain absolute in /home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026. Original env stays at /home/datamata/Projects/hackathons/datadoomchallenge-2026/.env; never print it.
- No private Anthropic calls until parent has explicit DEV-data authorization and approves an exact reviewed run. Current usage73attempts/USD1.061508/zeroreserved, budgetUSD100/working80. Do not reset/restore/split the ledger.
- Serialize heavy checks/model jobs with canonical flock; JS concurrency2. No new dependencies, installs or generic browser automation. CUA previously fails before navigation; do not claim browser QA from components/build.
- Source worktree /home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026, branch feat/cqa-prototype, starting86155d5 (teammate main merge). Original main is also86155d5. No other implementation worker concurrently; parent owns review/integration/push/runtime acceptance.

## Review Focus

1. Language remains independent of RU/KZ/EN source filters and survives server reopening.
2. A queued job captures its language even if settings change before evaluation; recovery/errors retain provenance without resending.
3. Old English evaluations/reports remain valid and visibly labeled; settings never claim that old text was translated.
4. Russian UI includes dynamic counts/states, criterion definitions, comparison labels, evidence/scoring, import validation, errors and accessibility labels without translating user/source content or API IDs.
5. Existing strict scoring/export/provider boundaries and the measured presentation comparison remain reproducible after prompt-version changes.

## Task 1: Durable analysis-language settings and model output provenance

**Files:** Create backend/src/cqa/preferences.py and backend/tests/test_preferences.py; modify models.py, main.py, jobs.py, evaluations.py, custom_metrics.py, metric_models.py, assistant.py, analytics_models.py and reports.py only where needed; update relevant backend tests, docs/api-contract.md, docs/openapi.json and generated frontend/src/api-types.ts. Preserve historical local-model harness inputs if imports change; scripts/local_model_comparison.py may receive only a compatibility adjustment to reconstruct frozen v1 prompts.

**Interfaces:** WorkspaceSettings model has only analysis_language: Language='RU'. Preference service returns defaultRU without read mutation; POST validates/persists the exact model. New Run/Evaluation/CustomAssessment/ReportMessage metadata carries analysis_language; legacy response defaultsEN. Job creation snapshots current language. Evaluators use that snapshot (including failures), not live settings. Assistant captures once per request and passes the same value to any child custom run. Prompt context/system selects Russian/Kazakh/English explanations, assistant questions/intent titles/metric wording, while canonical keys/IDs remain unchanged. Deterministic assistant numeric/queue/error text follows the selected language; statistics still come from backend. Bump operational prompt versions and preserve reconstructable historical v1 constants or explicit helper for the frozen local experiment. No extra language field in provider output grammar is necessary.

- [ ] Add meaningful offline regressions: GET defaultRU; POST EN/KZ then reopen persists; unknown/invalid values422; no provider use or source/evaluation writes from settings; new baseline/custom queued inRU then setting changedEN still sendsRU and retainsRU; assistant captureslanguage for clarification/update/addmetric; old missing-language records loadEN; historical prompt reconstruction remains unchanged.
- [ ] Implement the preference endpoints, snapshots and strict API metadata/prompt changes. Preserve existing three-argument fake/evaluator interfaces where practical by resolving durable run metadata. No actual runtime or paid action.
- [ ] Update/generate handoff/OpenAPI/types, run relevant regressions and one backend suite using active backend/.venv under canonical flock with a separate ignored test DB, check whitespace, self-review actual diff and commit only task-owned files. Write task-1-report.md with exact commands/results/commit, open questions and what was not checked.

## Task 2: Russian interface and analysis-language settings screen

**Files:** Own frontend/src/App.tsx, Analysis.tsx, ChecklistEditor.tsx, ConversationDrawer.tsx, DatasetImport.tsx, ReportWorkspace.tsx, ui.tsx, domain.ts, import-data.ts, api.ts, new locale.ts/Settings.tsx as useful, index.html, minimal styles.css, frontend component/domain/import tests; README/docs/demo.md for current startup/Russian demo instructions. Do not modify backend/schema/generated API types from Task1.

**Interfaces:** Consume GET/POST /api/settings with api.settings()/api.saveSettings(settings). Add an accessible Settings navigation/view showing 'Язык анализа' with Русский(RU), Казахский(KZ), Английский(EN), persisted server value, explicit save/loading/error/success states. Explain in Russian that saved results keep their original language and changing this preference does not launch work. Use metadata to label old/new analysis language in conversation/run/report message views where present. Fixed UI is Russian, independent of model/source language. Dates/numbers use ru-RU/Asia/Almaty; language/channel/group/status/criterion IDs have Russian labels. Preserve user-entered report/criterion/metric text and source transcripts verbatim. Built-in cqa-v1 titles/wording/scale meanings may be localized at display/draft level while underlying immutable source stays untouched. Localize canonical filter-interpretation/metadata strings by a bounded known mapping instead of hiding them. Unknown errors/data text remain inspectable rather than inventing translations.

- [ ] Add meaningful settings regressions: default/serverRU displayed; chooseEN and save exactPOST, remount loadsEN; API failure visible and does not claim saved success; source-language filter remains separate; no evaluation/assistant request from changing/saving settings. Update existing behavior tests for Russian accessible labels while preserving actual assertions.
- [ ] Localize all visible static UI/help/placeholders/aria/states and built-in dynamic labels, settings/navigation, overview/report/evidence/checklist/import/review workflows. Preserve teammate design and existing import, saved-report provenance, add/replace/apply and cancellation behavior. Do not translate data/keys via blanket DOM replacement.
- [ ] Run the frontend suite once after focused checks, TypeScript/production build and format/whitespace checks under shared lock. Self-review complete actual diff, commit only task-owned files and write task-2-report.md. Report residual English that is original user/model/source content separately from any unlocalized product string.

## Parent acceptance and delivery

Parent reviews each task and one final cross-layer diff, fixes meaningful findings through the same worker, verifies source/ledger/export invariants, and coordinates exactly one quiescent restart using the teammate's new scripts/dev.py supervisor. Run lifecycle checks for the changed teammate startup before using it. Preserve actual app credentials/runtime. Verify settings and Russian UI contracts over local HTTP; use CUA for visible browser acceptance only if available.

If source-specific approval arrives, parent may authorize one explicit Russian DEV baseline run through the sole existing HTTP JobManager, retaining all prior English evaluations, then validate/export the actual new baseline and explicitly refresh/relabel prepared reports. No blind retry or stale68-attempt assertion. A change in new model judgments is recorded as a new run, never attributed to locale formatting. If approval remains absent, Russian UI/new-output support ships with old English results honestly labeled; private-data acceptance stays open. No fabricated translations or control set. Finish by integrating reviewed source to original main, nonforce private push and durable handoff, preserving unrelated user files.
