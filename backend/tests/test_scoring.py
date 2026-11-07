import json
from copy import deepcopy
from math import isfinite

import pytest

from cqa.rubric import default_checklist
from cqa.scoring import score_criteria


def judgments():
    values = [True, None, None, 15, True, 7, True, False]
    return [{"criterion_id": d["id"], "value": value, "rationale": "Synthetic evidence or checked region.",
             "evidence_turns": [1, 8]} for d, value in zip(default_checklist()["criteria"], values)]


def test_appendix_arithmetic_and_false_preserved():
    result = score_criteria(default_checklist()["criteria"], judgments(), 8)
    assert result["final_score"] == 85.38
    assert result["applicable_weight"] == 65
    assert result["earned_points"] == 55.5
    dialogue = next(c for c in result["criteria"] if c["criterion_id"] == "dialogue")
    assert dialogue["points"] == 10.5
    assert result["criteria"][-1]["value"] is False
    assert result["critical_flag"] is False


def test_critical_does_not_change_total():
    rows = judgments()
    rows[-1]["value"] = True
    result = score_criteria(default_checklist()["criteria"], rows, 8)
    assert result["final_score"] == 85.38
    assert result["critical_flag"] is True


@pytest.mark.parametrize("index,value", [(0, None), (0, 1), (3, True), (3, 6), (5, 5), (7, 0), (3, "15")])
def test_invalid_raw_values(index, value):
    rows = judgments()
    rows[index]["value"] = value
    with pytest.raises(ValueError):
        score_criteria(default_checklist()["criteria"], rows, 8)


@pytest.mark.parametrize("evidence", [[0], [9], [True], [1.0], [], [1, 1]])
def test_invalid_evidence(evidence):
    rows = judgments()
    rows[0]["evidence_turns"] = evidence
    with pytest.raises(ValueError):
        score_criteria(default_checklist()["criteria"], rows, 8)


def test_missing_duplicate_and_unknown_criterion_rejected():
    for rows in [judgments()[:-1], judgments() + [judgments()[0]],
                 [{**judgments()[0], "criterion_id": "unknown"}] + judgments()[1:]]:
        with pytest.raises(ValueError):
            score_criteria(default_checklist()["criteria"], rows, 8)


def test_no_applicable_weight_returns_null():
    definition = deepcopy(default_checklist()["criteria"][1])
    result = score_criteria([definition], [judgments()[1]], 8)
    assert result["final_score"] is None
    assert result["applicable_weight"] == 0


def test_zero_and_all_scale_steps():
    for value in [0, 5, 10, 15, 20]:
        rows = judgments()
        rows[3]["value"] = value
        result = score_criteria(default_checklist()["criteria"], rows, 8)
        assert result["criteria"][3]["value"] == value
    rows = judgments()
    for row in rows:
        if row["value"] is not None:
            row["value"] = False if type(row["value"]) is bool else 0
    assert score_criteria(default_checklist()["criteria"], rows, 8)["final_score"] == 0


def test_complete_rubric_is_independent_copy():
    rubric = default_checklist()
    assert rubric["id"] == "cqa-v1"
    assert len(rubric["criteria"]) == 8
    assert sum(d["weight"] for d in rubric["criteria"]) == 100
    assert all(d["description"] and d["scale_meanings"] for d in rubric["criteria"])
    rubric["criteria"][0]["weight"] = 999
    assert default_checklist()["criteria"][0]["weight"] == 10


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1, 10**400])
def test_nonfinite_or_out_of_range_scale_value_rejected(value):
    rows = judgments()
    rows[3]["value"] = value
    with pytest.raises(ValueError):
        score_criteria(default_checklist()["criteria"], rows, 8)


@pytest.mark.parametrize("rationale", ["", " \n\t"])
def test_empty_rationale_rejected(rationale):
    rows = judgments()
    rows[0]["rationale"] = rationale
    with pytest.raises(ValueError):
        score_criteria(default_checklist()["criteria"], rows, 8)


@pytest.mark.parametrize("values", [(True, True), (False, False), (None, None)])
def test_unrepresentable_aggregate_weight_is_rejected_by_direct_scoring(values):
    definitions = [default_checklist()["criteria"][0], default_checklist()["criteria"][4]]
    for criterion in definitions:
        criterion.update(weight=1e308, allow_na=True, na_condition="Synthetic applicability condition.")
    rows = [{"criterion_id": criterion["id"], "value": value,
             "rationale": "Synthetic checked region.", "evidence_turns": [1]}
            for criterion, value in zip(definitions, values)]
    with pytest.raises(ValueError, match="[Aa]ggregate"):
        score_criteria(definitions, rows, 1)


@pytest.mark.parametrize("weights,second_value,expected_score", [
    ((8e307, 8e307), False, 50),
    ((1e308, 7e307), None, 100),
    ((1.7976931348623157e308, 0), False, 100),
])
def test_representable_large_aggregate_weight_keeps_finite_scoring_and_na_critical_semantics(weights, second_value, expected_score):
    definitions = [default_checklist()["criteria"][0], default_checklist()["criteria"][4], default_checklist()["criteria"][-1]]
    for criterion, weight in zip(definitions, weights):
        criterion["weight"] = weight
    definitions[1].update(allow_na=True, na_condition="Synthetic applicability condition.")
    rows = [{"criterion_id": criterion["id"], "value": value,
             "rationale": "Synthetic checked region.", "evidence_turns": [1]}
            for criterion, value in zip(definitions, (True, second_value, True))]
    result = score_criteria(definitions, rows, 1)
    assert result["final_score"] == expected_score
    assert result["critical_flag"] is True
    assert result["criteria"][1]["applicable"] is (second_value is not None)
    assert isfinite(result["earned_points"]) and isfinite(result["applicable_weight"])
    json.dumps(result, allow_nan=False)
