# CQA hackathon: verified task briefing

Reviewed on 2026-11-07. Stage: document familiarization, before product or architecture selection.

## Problem and required product

The student guide asks for a Conversation Quality Analytics prototype in 24 hours. A user configures a checklist, imports conversations, evaluates the human operator, and inspects scores with explanations and supporting transcript turns. A user can appeal an individual criterion; a reviewer can confirm or revise it with a reason. The system preserves the original evaluation, review decision, and final recalculated result.

Required checklist configuration includes adding/editing criteria, wording, weight, answer type, numeric scale, and N/A availability. Configuration must be saved and applied through the interface. Organizers will separately ask the team to replace a criterion through the UI and evaluate supplied conversations. This makes configurability a demonstrated requirement.

The frontend uses HTML, CSS, and JavaScript and should be structured for future adaptation as a Dynamics 365 HTML component. The team chooses model, backend, and storage. Authentication is unnecessary for the demonstration. The interface must distinguish submitting an appeal from reviewing it.

Source: student guide pp.1-2,4; `evidence/requirements/student-guide.txt:12`, `:58`, `:176`.

## Data and evidence

- DEV contains 65 conversations: 60 synthetic chats and five real calls. The stated language distribution is 35 RU, 15 KZ, and 15 EN across the dataset.
- The organizer GET API accepts `group_id` and returns records with `conversation_id`, `channel`, `language`, `transcript`, and `audio_url`.
- Transcript entries have `timestamp`, `speaker`, and `text`; roles include client, operator, bot, and system. Evaluate the operator, retaining other roles as context.
- Chat timestamps are MM:SS; call timestamps are ISO 8601 with timezone. Preserve original timestamps.
- Calls already have transcripts and recording links. Provide playback or a link to a player and navigation to the relevant call fragment. Speech recognition is not required by the supplied materials; audio is needed if evaluating diction or intonation.
- Each criterion needs a value, points, weight, explanation, and evidence. For an omission, identify the checked region where the action was expected. Explain the applicability condition for N/A.
- Export evidence uses one-based indices into the complete original transcript, including client, bot, and system entries. Operator-only renumbering would be incorrect.

Source: student guide pp.1-4; appendix pp.2-3.

## Default scoring contract

| Export ID | Criterion | Raw values | Weight |
| --- | --- | --- | --- |
| `contact` | Greeting and introduction | boolean | 10 |
| `discovery` | Understand and clarify the request | boolean or null | 15 |
| `identification` | Verify identity before protected disclosure/action | boolean or null | 20 |
| `consultation` | Correctness and completeness | 0, 5, 10, 15, 20, or null | 20 |
| `empathy` | Courtesy and response to the specific inconvenience | boolean | 15 |
| `dialogue` | Clarity, sequence, and handling of waiting | 0, 4, 7, 10 | 15 |
| `closure` | Summary or further-help offer, and farewell | boolean or null | 5 |
| `critical` | Serious violation detected | boolean | Unscored |

N/A is allowed only under the stated conditions: enough information from the beginning for discovery; no protected action/disclosure requiring identification; conversation ended before the request was formulated for consultation; interruption before an opportunity to close for closure.

For scored applicable criteria, normalize the raw value to its maximum and multiply by weight. The total is `100 * sum(weight * normalized_value) / sum(applicable_weight)`, rounded to two decimal places. This formula is a direct derivation of the checklist's calculation instructions. Exclude N/A criteria from numerator and denominator. If no weighted criterion applies, the checklist says not to calculate a total.

The seven weights sum to 100. The dialogue maximum is 10, with weight 15; raw value 7 therefore contributes 10.5 points before N/A redistribution. The appendix example independently recomputes to 85.38 (55.5 earned points / 65 applicable weight * 100).

The separate critical flag covers insulting the client, offering paid services outside the company, or disclosing confidential information. An offer itself is sufficient for the outside-company service violation; client agreement/payment is unnecessary. `critical_flag` must equal the `critical` value and does not automatically zero the total.

The three-minute first-response threshold, tags, and attachments are explicitly excluded from this task's scoring. No passing-score threshold is supplied.

Source: checklist pp.1-3; appendix p.3. Independently inspected checklist p.2 and appendix p.3 as rendered images.

## Delivery and demonstration

At hour 23, organizers release ten control chats. By hour 24, both result files must be committed and pushed to the public repository whose link was supplied to organizers:

- `results/dev/results.json`: all 65 DEV records.
- `results/prod/results.json`: exactly ten control records, including processing failures.

The files use schema version `1.0`, team name, actual model name/mode, and a results array. Every successful record has the original conversation ID, `status: "ok"`, all eight criterion IDs exactly once, typed raw values, rationale, evidence indices, and final score/critical flag. A failed evaluation retains its ID with `status: "error"`, empty criteria, null score, and a reason. An error is distinct from a zero score or N/A. Use UTF-8 JSON without comments, invalid commas, omitted records, or duplicate IDs.

The repository also needs a README with clear startup instructions. For a paid API, state the model and approximate cost per complete evaluation, accounting for all calls.

The five-minute presentation should demonstrate a conversation, evaluation and evidence navigation, N/A and the total, an appeal and review decision with recalculation, and a checklist change applied through the UI.

Deadline interpretation: the guide permits data processing and checklist changes through the frozen application after stop-code. The later results appendix explicitly requires the submitted DEV/control JSONs to be pushed before stop-code. The stricter appendix delivery requirement governs submission; post-freeze demonstration capability does not extend that deadline.

Source: guide p.4; appendix pp.1-3. Source documents specify relative hours; the actual event start/deadline was not verified.

## Presentation context

The five-page Data presentation covers the event, Freedom's brand and ecosystem, investment business, and social contacts. It supplies company context and visual identity; it contains neither conversation records nor an additional technical specification. Company statistics in that presentation were read as dated source content and were not externally verified.

Source: `Data 2 (1) 1.pdf`, all five pages visually inspected.

## Open issues for product and execution discussion

1. How should a separately demonstrated replacement criterion map to the fixed eight-ID submission schema? The documents do not define that mapping. Preserve the specified export contract until clarified.
2. The materials do not provide a reference answer set, judging weights, or a detailed financial-product knowledge base for verifying consultation correctness. These cannot be assumed from the brief alone.
3. The exact event clock, team capacity, available model access, and compute budget remain to be established before planning delivery.
4. Actual API contents, record quality, language coverage, recording accessibility, and runtime behavior remain unchecked; this stage did not make network requests.
5. If custom configuration permits all weighted criteria to be N/A, the checklist says no total, while the standard successful export describes a numeric total. The standard starting checklist has non-N/A weighted criteria; custom export behavior needs a decision if that edge case becomes relevant.

## Product interpretation, not an additional requirement

A coherent initial direction is a quality-review workspace that connects each score to evidence, supports efficient human correction, and makes checklist changes traceable. Prioritize reliable evaluation, exact scoring, evidence navigation, the appeal lifecycle, and complete export before optional analytics. Keep semantic evaluation separate from deterministic score arithmetic so a model judgment cannot silently change the weighting rules. No architecture, model, implementation scope, or optional feature has been selected.
