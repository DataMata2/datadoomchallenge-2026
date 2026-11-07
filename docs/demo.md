# Local demonstration and delivery

Use the existing prepared runtime and single app owner. Exact startup commands are in [README](../README.md). The current demonstration is a local reference UI; the repository must remain private. Source records and assigned October 2026 dates are separate: calendar charts illustrate assigned demo dates, not historical service trends.

## Prepared path without a new model request

1. Open `http://127.0.0.1:5173`. Overview selects DEV and October 2026 in Asia/Almaty. Inspect the visible filter interpretation, eligible denominator and group selector. Read-only HTTP verification observed 65 selected/evaluated, zero failed/unevaluated. Across all channels, assigned day has n=32 and mean 67.29; assigned night has n=33 and mean 71.07. These are descriptive demo cohorts.
2. In **Assistant & reports**, reopen `7a44d2a6-5c5d-48f2-87cc-bbb7a1397299` (October agent-chat month-half comparison, 60 conversations). This is retained prepared output, not evidence that a new assistant request succeeded. Inspect a metric and its source row/evidence link. Saved drilldown retains copied value, rationale, evidence, evaluation ID, revision, checklist and generated-at provenance; the drawer labels differing current values without claiming revision equality. Refresh is explicit.
3. Open DEV `p1-en-001`, evaluation `3748c5e1-3707-464d-8369-d5181aa3f810`. Discovery and identification are N/A, so applicable weight is 65; earned points 60 produce 92.31. Evidence uses every original transcript turn, including nonoperator turns. Inspect the raw/maximum/weight explanation and original/final toggle.
4. Open DEV `p1-en-013`, evaluation `bec8699a-c475-44a5-9487-d513e58de230`. Critical is true with source turn 12; the arithmetic total remains 26.25. The critical flag is unscored and independent.
5. Open DEV `p1-en-006`, evaluation `0bb2c8cc-2891-443d-9932-e5b5cdfeab50`. Consultation is 15/20, total 90.50. Source turns 16, 21, 23, 26, 28 and 30 support an escalation, follow-up location and report instructions. Read the existing rationale before any review. Coordinator demo appeal `22bcb06a-86d4-43ba-aee5-4602df81d862` confirmed consultation 15 and retained original/final 90.50. Its reason cites observable escalation/follow-up/report guidance while noting that supplied materials do not verify full operational resolution; it assumes no SLA or extra policy and makes no grading-accuracy claim. This is a coordinator demonstration review, not independently certified human grading. The agent-chat report became stale from the changed appeal-history revision and was explicitly refreshed; its new generated-at is `2026-11-07T21:36:19.168558+00:00`. Export bytes were unchanged.
6. Validate/export the regular baseline using the commands below. The existing DEV file contains all 65 IDs exactly once, exactly eight required criteria per successful record, actual model identity and team name `404 Dauren Not Found`, and no full transcripts or recording links.

The five-call report `23eedbe6-7107-48a9-82e0-62d01b4c9745` selects DEV / voice call / RU, n=5. No real custom metric run exists. Show its selected source population and the independent-metric controls without implying that empty coverage is an assessed result.

## Model actions and explicit remaining gates

Private DEV-to-provider authorization is pending with the overseer. Until confirmed, do not send a new assistant prompt, custom judgment, or checklist assessment using real DEV or derived report context. The earlier private Task 5 smoke remains blocked and was not retried. Its baseline assertions need the latest actual canonical usage before any later authorized run.

Wholly manufactured native-schema checks recorded five explicitly reviewed requests. The first two assistant actions were rejected with HTTP 400 because the transmitted schema exceeded provider complexity limits; the custom boolean judgment was accepted. A compact transport fix keeps the complete typed target/mask checks and passed two corrected assistant probes: an initial October report and an English-only follow-up retaining its period with exactly `filters.language` in the mask. All attempts remain in canonical billing. Added measured cost was USD 0.032006, bringing canonical usage to 73 attempts / USD 1.061508 / zero reservations. These checks used fixed invented contexts, not a real DEV report or a persistent live conversation; they establish native-schema/contract acceptance, not DEV accuracy or completion of the five-call metric.

After the overseer confirms private-data authorization, these are ready demo requests, not previously verified live outcomes:

- Initial: “For DEV agent chats in October 2026, compare the first and second half of the month. Show quality score, dialogue and critical violations.”
- Follow-up: “Show only Russian conversations. Keep the same period, channel and comparison.”
- Five-call custom metric: use the retained RU voice-call report, with boolean **Explicit operator/team follow-up**: true when an operator/team explicitly commits to initiating future contact; false when future contact is explicitly client-led; N/A when no future-contact instruction/commitment exists. Same-call holds do not count. Every judgment needs one-based full-transcript evidence. False is descriptive and is not automatically poor quality.
- Checklist: save a distinct new version after a deliberate wording/weight change, select it in `p1-en-001`, then explicitly evaluate only that conversation. Preserve cqa-v1 results/export. No changed checklist or fresh real assessment was created in Task 7.
- Review: submit an appeal with actual source turns and rationale, then enter the reviewer’s source-grounded decision. A confirmation is valid. Do not invent an override or a business policy for a score animation.

CUA navigation/DOM/screenshot failures (`undefined timeoutMs`) prevented browser visual QA. HTTP 200, synthetic DOM tests and compilation do not establish rendered browser behavior; no screenshot is claimed. The [local-model comparison](presentation-model-comparison.md) records the initial import failure, corrected setup and five measured outcomes: four strict successes, one incomplete criterion set and a source-grounded missed critical flag. Keep it separate from product evaluations.

## Repeatable read-only checks and DEV export

Run from the reviewed source checkout, preserving the active absolute database path:

```bash
cqa_active=/home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026
python3 scripts/verify_http.py --dataset DEV --expected-count 65 \
  --output "$cqa_active/runtime/http-verification.json"
python3 scripts/export_results.py --dataset DEV --team-name '404 Dauren Not Found' \
  --output results/dev/results.json
backend/.venv/bin/python scripts/validate_results.py --input results/dev/results.json \
  --database "$cqa_active/runtime/cqa.sqlite3" --dataset DEV --expected-count 65 \
  --team-name '404 Dauren Not Found'
```

Export and validation do not start evaluation. Validation opens SQLite read-only and checks source population, strict schema, full-transcript evidence, score arithmetic and equality with current baseline evaluations/metadata. A reviewed change after export requires a deliberate fresh export.

## Real ten-record control delivery when released

The organizer control dataset is unavailable. There is no control file, guessed URL/group, fabricated record or premature request. The exact external dependency is the organizer's real ten-record source envelope and its actual `dataset_group_id`. Publication remains the user's decision.

When the real file is available and its model use is authorized, export `CQA_CONTROL_FILE` to its ignored local path. This sequence reads its actual group, refuses a count other than ten, imports without evaluating, starts exactly one explicit baseline run through the existing sole API owner, then exports/validates. Keep the existing canonical database and billing ledger.

```bash
: "${CQA_CONTROL_FILE:?Set the ignored local path of the released organizer envelope}"
cqa_active=/home/datamata/.codex/worktrees/cb66/datadoomchallenge-2026
cqa_control_group=$(python3 - <<'PY'
import json, os
with open(os.environ['CQA_CONTROL_FILE']) as source:
    data = json.load(source)['data']
if data['total_records'] != 10 or len(data['records']) != 10:
    raise SystemExit('The released control source must contain exactly ten records')
print(data['dataset_group_id'])
PY
)
python3 scripts/import_dev.py --source "$CQA_CONTROL_FILE" --group "$cqa_control_group"
flock "$cqa_active/runtime/model-jobs.lock" python3 scripts/evaluate_results.py \
  --dataset "$cqa_control_group" --expected-count 10 \
  --state "$cqa_active/runtime/control-evaluation.json"
python3 scripts/export_results.py --dataset "$cqa_control_group" \
  --team-name '404 Dauren Not Found' --output results/prod/results.json
backend/.venv/bin/python scripts/validate_results.py --input results/prod/results.json \
  --database "$cqa_active/runtime/cqa.sqlite3" --dataset "$cqa_control_group" \
  --expected-count 10 --team-name '404 Dauren Not Found'
```

For a released HTTPS source instead, set the private `CQA_CONTROL_SOURCE_URL` and the organizer-provided `CQA_CONTROL_GROUP`, then replace only import with:

```bash
python3 scripts/import_dev.py --url-env CQA_CONTROL_SOURCE_URL \
  --group "$CQA_CONTROL_GROUP" --env-file /absolute/path/to/ignored/backend.env
```

Do not print the URL. Use that actual group in later commands. The evaluation helper saves a durable marker before dispatch. If interrupted with a known run ID, repeat its command with `--resume`; it polls the existing run without sending another assessment. If dispatch outcome is unknown, inspect existing API run IDs before acting. An existing state file refuses a new dispatch. A failed/interrupted run retains every attempt and is not automatically retried. Only reviewed final artifacts should be committed/pushed by the overseer.
