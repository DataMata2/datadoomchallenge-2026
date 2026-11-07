from concurrent.futures import ThreadPoolExecutor

import pytest

from cqa.budget import Budget, BudgetExceeded
from cqa.storage import Store


def test_concurrent_reservations_enforce_working_and_hard_limits(tmp_path):
    budget = Budget(Store(tmp_path / "budget.db"), hard_limit=1, working_limit=.8)
    def reserve(_):
        try:
            return budget.reserve(model="fixture", purpose="evaluation", amount=.3)
        except BudgetExceeded:
            return None
    with ThreadPoolExecutor(max_workers=8) as pool:
        ids = [id for id in pool.map(reserve, range(8)) if id]
    assert len(ids) == 2
    assert budget.summary()["reserved_usd"] == .6
    with pytest.raises(BudgetExceeded):
        budget.reserve(model="fixture", purpose="evaluation", amount=.3)
    budget.reserve(model="fixture", purpose="control", amount=.4, allowance="control")
    with pytest.raises(BudgetExceeded):
        budget.reserve(model="fixture", purpose="control", amount=.01, allowance="control")


def test_usage_reconciliation_and_unknown_outcome_survive_reopen(tmp_path):
    store = Store(tmp_path / "budget.db")
    budget = Budget(store)
    id = budget.reserve(model="fixture", purpose="evaluation", amount=2.1)
    budget.finish(id, status="invalid_output", raw_usage={"input_tokens": 100, "output_tokens": 200}, cost=.0022)
    unknown = budget.reserve(model="fixture", purpose="evaluation", amount=2.1)
    budget.finish(unknown, status="unknown", error="Provider timeout; outcome unknown")
    summary = Budget(Store(store.path)).summary()
    assert summary["spent_usd"] == .0022
    assert summary["reserved_usd"] == 2.1
    assert summary["attempts"][0]["raw_usage"] is not None
    assert summary["remaining_usd"] == 97.8978
