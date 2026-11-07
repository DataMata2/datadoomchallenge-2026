"""Baseline rubric translated from the supplied three-page checklist."""

from copy import deepcopy


def _criterion(id, title, description, answer_type, values, meanings, weight, na_condition=None, critical=False):
    return {"id": id, "title": title, "description": description, "answer_type": answer_type,
            "allowed_values": values, "scale_meanings": meanings, "weight": weight,
            "allow_na": na_condition is not None, "na_condition": na_condition, "critical": critical}


_BASELINE = {
    "id": "cqa-v1", "name": "Conversation quality baseline", "parent_version_id": None,
    "instructions": (
        "Evaluate only the human operator in RU, KZ, or EN. Client, bot and system turns remain context. "
        "Use one-based evidence indices across the complete original transcript. Give a short rationale and "
        "supporting evidence; for an omission identify the checked region where the action was expected; "
        "for N/A explain the stated applicability condition. Distinguish solution correctness from dialogue clarity. "
        "The three-minute first-response threshold, tags and attachments do not affect scoring. "
        "Boolean true earns full weight, false earns zero; numeric scores are proportional to their maximum. "
        "Exclude N/A weights and normalize applicable weights to 100; round the total to two decimal places. "
        "No applicable weighted criteria means no total. Critical violations are separate and never zero the total."
    ),
    "criteria": [
        _criterion("contact", "Greeting and introduction", "The operator greets the client in the client's language and introduces themselves in the first response.", "boolean", [False, True], {"false": "One or both required actions are absent or incorrect.", "true": "Greeting and introduction are both present in the first response."}, 10),
        _criterion("discovery", "Understand and clarify the request", "The operator uses known details and clarifies missing information before answering.", "boolean", [False, True], {"false": "Needed clarification is omitted or incorrect.", "true": "Known details are considered and missing information is clarified before the answer."}, 15, "The information needed to answer was available from the beginning."),
        _criterion("identification", "Verify identity", "Identity verification is confirmed before protected disclosure or a protected action. If required verification is not confirmed in the transcript, answer false.", "boolean", [False, True], {"false": "Required verification is absent, unconfirmed or performed after disclosure/action.", "true": "Verification is confirmed before protected disclosure/action."}, 20, "The request does not require identity verification, such as a general question about tariffs."),
        _criterion("consultation", "Correctness and completeness", "Assess how correctly and completely the request is resolved or the next step is provided.", "scale", [0, 5, 10, 15, 20], {"0": "No substantive answer, or the key recommendation is incorrect.", "5": "General guidance is given, but the client still cannot tell how to proceed.", "10": "Part of the request is resolved; a substantial question remains open.", "15": "The main question is resolved; a secondary detail is omitted.", "20": "All substantial questions are resolved, or a correct next step is provided."}, 20, "The conversation ended before the client formulated the request."),
        _criterion("empathy", "Courtesy and response to inconvenience", "The operator is polite and, when the client expresses dissatisfaction or an inconvenience, responds to that specific problem.", "boolean", [False, True], {"false": "The operator is impolite or fails to address an expressed specific inconvenience.", "true": "The operator is polite and responds to the client's specific problem when one is expressed."}, 15),
        _criterion("dialogue", "Clarity, sequence and waiting", "Assess clarity, sequence, coherence and advance notice of an explicit wait, independently of solution completeness.", "scale", [0, 4, 7, 10], {"0": "Incoherent or contradictory replies make the dialogue impossible to follow.", "4": "Wording or answer order forces the client to ask again.", "7": "One noticeable disruption, but the client can understand the answer and continue.", "10": "Answers are clear and coherent; the operator warns the client when there is an explicit wait."}, 15),
        _criterion("closure", "Summary, further help and farewell", "The operator summarizes or offers further help, and says goodbye.", "boolean", [False, True], {"false": "The required closing actions are missing despite an opportunity to close.", "true": "A summary or further-help offer is given together with a farewell."}, 5, "The conversation was interrupted before an opportunity to close."),
        _criterion("critical", "Serious violation", "Flag an insult, an offer of paid services outside the company, or confidential disclosure. An offer to invest money transferred personally to the operator, or to provide private paid consultation using the client's personal number, is sufficient; client agreement or payment is unnecessary.", "boolean", [False, True], {"false": "None of the three serious violations is detected.", "true": "At least one of the three serious violations is detected."}, 0, critical=True),
    ],
}


def default_checklist() -> dict:
    return deepcopy(_BASELINE)
