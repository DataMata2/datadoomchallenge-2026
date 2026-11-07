from types import SimpleNamespace

import pytest

from cqa.budget import Budget
from cqa.provider import ModelClient, ProviderError
from cqa.storage import Store


class FakeSDK:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.messages = self
        self.requests = []

    def create(self, **kwargs):
        self.requests.append(kwargs)
        if self.error:
            raise self.error
        return self.response


def response(text='{"criteria": []}', stop_reason="end_turn", stop_details=None):
    return SimpleNamespace(model="claude-sonnet-5-5", id="fixture-message", _request_id="fixture-request",
                           usage={"input_tokens": 100, "output_tokens": 200}, stop_reason=stop_reason,
                           stop_details=stop_details, content=[SimpleNamespace(type="text", text=text)])


@pytest.mark.parametrize("reply", [response("not json"), response(stop_reason="max_tokens"),
    response(stop_reason="refusal"), response(stop_details={"type": "refusal"}), response("[]")])
def test_invalid_outputs_keep_paid_usage(tmp_path, reply):
    budget = Budget(Store(tmp_path / "provider.db"))
    sdk = FakeSDK(reply)
    client = ModelClient(budget, sdk=sdk)
    with pytest.raises(ProviderError) as caught:
        client.generate("Synthetic system", "Synthetic prompt", {"type": "object"}, "evaluation")
    attempt = budget.summary()["attempts"][0]
    assert caught.value.attempt_id == attempt["id"]
    assert attempt["cost_usd"] == .0022
    assert attempt["raw_usage"]["output_tokens"] == 200
    assert attempt["status"] == "invalid_output"
    assert attempt["reserved_usd"] == 0


def test_native_schema_request_is_bounded_and_has_no_sampling_or_forced_tool(tmp_path):
    budget = Budget(Store(tmp_path / "provider.db"))
    sdk = FakeSDK(response())
    reply = ModelClient(budget, sdk=sdk).generate("Synthetic system", "Synthetic prompt", {"type": "object"}, "evaluation")
    assert reply.parsed == {"criteria": []} and reply.cost_usd == .0022
    request = sdk.requests[0]
    assert request["max_tokens"] == 4096
    assert request["thinking"] == {"type": "between_tools"}
    assert request["output_config"]["format"]["type"] == "json_schema"
    assert not ({"temperature", "top_p", "top_k", "tool_choice", "tools"} & request.keys())


def test_timeout_retains_conservative_reservation(tmp_path):
    budget = Budget(Store(tmp_path / "provider.db"))
    with pytest.raises(ProviderError):
        ModelClient(budget, sdk=FakeSDK(error=TimeoutError())).generate("system", "prompt", {"type": "object"}, "evaluation")
    attempt = budget.summary()["attempts"][0]
    assert attempt["status"] == "unknown" and attempt["cost_usd"] is None
    assert attempt["reserved_usd"] >= 2


def test_all_clients_share_a_two_request_gate(tmp_path):
    import threading
    import time
    from concurrent.futures import ThreadPoolExecutor
    active = peak = 0
    guard = threading.Lock()
    class BlockingSDK(FakeSDK):
        def create(self, **kwargs):
            nonlocal active, peak
            with guard:
                active += 1
                peak = max(peak, active)
            time.sleep(.02)
            with guard:
                active -= 1
            return response()
    budget = Budget(Store(tmp_path / "provider.db"))
    clients = [ModelClient(budget, sdk=BlockingSDK()) for _ in range(8)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda c: c.generate("system", "prompt", {"type": "object"}, "evaluation"), clients))
    assert peak == 2
    assert len(budget.summary()["attempts"]) == 8
    assert budget.summary()["reserved_usd"] == 0


def test_cancellation_after_reservation_stops_send_without_charge(tmp_path):
    from cqa.provider import CancelledBeforeSend, provider_context
    budget = Budget(Store(tmp_path / "provider.db"))
    sdk = FakeSDK(response())
    checks = 0
    def cancelled():
        nonlocal checks
        checks += 1
        return checks == 2
    with provider_context("fiction-run", cancelled), pytest.raises(CancelledBeforeSend):
        ModelClient(budget, sdk=sdk).generate("system", "prompt", {"type": "object"}, "evaluation")
    assert sdk.requests == []
    assert budget.summary()["reserved_usd"] == budget.summary()["spent_usd"] == 0
    assert budget.summary()["attempts"][0]["status"] == "cancelled"


def test_schema_invalid_or_duplicate_json_is_paid_and_rejected(tmp_path):
    schema = {"type": "object", "properties": {"criteria": {"type": "array"}}, "required": ["criteria"], "additionalProperties": False}
    for index, text in enumerate(['{"extra": true}', '{"criteria": [], "criteria": []}']):
        budget = Budget(Store(tmp_path / f"provider-{index}.db"))
        with pytest.raises(ProviderError):
            ModelClient(budget, sdk=FakeSDK(response(text))).generate("system", "prompt", schema, "evaluation")
        assert budget.summary()["spent_usd"] == .0022


def test_known_http_rejection_has_attempt_but_no_reservation_or_charge(tmp_path):
    error = RuntimeError("Synthetic provider rejection")
    error.status_code = 400
    budget = Budget(Store(tmp_path / "provider.db"))
    with pytest.raises(ProviderError):
        ModelClient(budget, sdk=FakeSDK(error=error)).generate("system", "prompt", {"type": "object"}, "evaluation")
    attempt = budget.summary()["attempts"][0]
    assert attempt["status"] == "failed" and attempt["cost_usd"] == 0 and attempt["reserved_usd"] == 0
