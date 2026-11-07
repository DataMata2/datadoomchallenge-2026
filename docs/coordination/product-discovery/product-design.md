# CQA product design: interview draft

Status: confirmed by user; implementation authorized. Requirements authority: `../materials-review/briefing.md`. Decision record: `ledger.md`.

## Product purpose

Help a quality lead discover a pattern in conversation quality, inspect the underlying evidence, and take a documented review action. Demonstrate natural-language analysis and transparent evaluation within the required five-minute presentation.

## Product surfaces

1. Daily overview and conversation list with filter controls. Overview summarizes the selected period rather than implying all records occurred today.
2. Conversation detail: original transcript, recording access for calls, criterion assessments, score arithmetic, evidence navigation, and original/reviewed results.
3. Checklist configuration: saved versions, editable criterion definitions, scales, weights, and applicability settings; apply a changed checklist through the interface.
4. Assistant conversation beside a saved analysis report. Queries establish visible filters; existing evaluations support immediate calculations and charts. New assessment instructions create tracked runs over the selected conversations.
5. Criterion appeal and reviewer decision flow, with reasons and recalculation, retained in the conversation record.

The teammate owns the final frontend and can develop independently. The backend and functional frontend prototype provide a stable API contract and example responses; adapt the final frontend to that contract as needed.

## Transparency

Each metric exposes its definition, population/filter, sample count, calculation, N/A handling, and relevant source evidence. A criterion additionally exposes its recorded assessment rationale, raw value, weighting, model/run/checklist identity, and reviewer decision where present. Source transcript indices and timestamps remain stable. UI styling is the teammate's responsibility; a help/inspection control is the user's suggested interaction.

## Analysis reports and custom metrics

Reports retain their question, visible filters, evaluated population, charts/tables, findings, supporting conversation links, and additional metrics. Follow-up instructions update the report. Existing-score calculations and new model evaluations are distinct operations so users can see what requires a new run.

A custom metric has a definition and answer domain, is evaluated over the selected set, and appears alongside the report's regular metrics. It does not change the regular quality score or the required eight-criterion result export. The mandatory checklist-change demonstration is a separate explicit versioned workflow.

## Demo scheduling metadata

The organizer DEV data has no chat calendar anchors; all five dated calls occur on one date. The user authorizes random dates for demonstrating calendar filters. Preserve all original content/timestamps/IDs. Store calendar assignment as separate reproducible demo scheduling metadata, independent of evaluation scores, with visible provenance. Date-based findings describe that assigned demonstration schedule. Reporting timezone defaults to Asia/Almaty; a holiday calendar/jurisdiction has not been selected or implemented.

Conversation type is explicitly the source `channel`: `agent chat` or `voice call`. Language is another supported source filter. Business-topic classification is outside the initial scope. Show cohort counts so small or empty selections are visible. Default reporting timezone is Asia/Almaty; propose Kazakhstan as the initial holiday calendar and make the interpreted dates/conditions visible. Calendar source verification remains an implementation task.

## Presentation and execution constraints

- Main story: natural-language discovery -> group comparison -> underlying conversation -> metric explanation/evidence -> appeal/review -> changed checklist. Fit the mandatory steps into five minutes; select the exact example after examining evaluations.
- Live operation: interactive filters/charts over prepared evaluations plus one fresh evaluation. Prepared results remain available for inference-service failure.
- Claude/local comparison is a separate presentation experiment, excluded from the product. No automatic dual evaluation or comparison screen.
- Run the presentation on the user's laptop. Local inference readiness and performance are not yet established.
- Deadline interpreted as 2026-11-08 12:00 Asia/Almaty. API budget cap USD 100, with measured usage and a reserve for the control set. No inference spend yet.
- Required DEV and ten-control-chat exports must be pushed before deadline, with exact original IDs and schema. No publication or push has yet occurred.

## Non-goals for initial implementation

Authentication, production Dynamics 365 integration, speech recognition, operator identity analytics without a source mapping, a model-comparison product feature, and hosted deployment are outside the agreed initial scope. Downloadable report export is secondary to a working saved report.
