from copy import deepcopy
from datetime import datetime

import pytest

from cqa.datasets import conversation_key, import_dataset
from cqa.storage import Store


def test_exact_source_preservation_and_idempotent_import(tmp_path, envelope):
    store = Store(tmp_path / "data.sqlite3")
    original = deepcopy(envelope)
    result = import_dataset(store, envelope, "DEV")
    row = store.get("conversations", conversation_key("DEV", "fiction-001"))
    for field, value in original["data"]["records"][0].items():
        assert row[field] == value
    assert row["observed_span"] == {"kind": "elapsed", "started_at": "00:00", "ended_at": "00:05", "duration_seconds": 5.0}
    assert row["scheduling"]["seed"] == 2026
    assert datetime.fromisoformat(row["demo_started_at"]).month == 10
    assert import_dataset(store, envelope, "DEV") == result
    assert envelope == original
    changed = deepcopy(envelope)
    changed["data"]["records"][0]["transcript"][0]["text"] = "Changed source."
    with pytest.raises(ValueError):
        import_dataset(store, changed, "DEV")


def test_dataset_namespaces_and_reproducible_full_month_day_night(tmp_path, envelope):
    payload = deepcopy(envelope)
    payload["data"]["records"] = [{**deepcopy(envelope["data"]["records"][0]), "conversation_id": f"fiction-{i:03}"} for i in range(65)]
    payload["data"]["total_records"] = 65
    one, two = Store(tmp_path / "one.db"), Store(tmp_path / "two.db")
    import_dataset(one, payload, "DEV")
    payload["data"]["records"].reverse()
    import_dataset(two, payload, "DEV")
    dates = {r["conversation_id"]: r["demo_started_at"] for r in one.list("conversations")}
    assert dates == {r["conversation_id"]: r["demo_started_at"] for r in two.list("conversations")}
    parsed = [datetime.fromisoformat(d) for d in dates.values()]
    assert {d.day for d in parsed} == set(range(1, 32))
    assert any(d.hour < 6 for d in parsed) and any(9 <= d.hour < 18 for d in parsed)
    payload["data"]["dataset_group_id"] = "CONTROL"
    import_dataset(one, payload, "CONTROL")
    assert len(one.list("conversations")) == 130


@pytest.mark.parametrize("mutation", ["duplicate", "count", "group", "failure", "timestamp", "backwards", "empty", "timezone", "unknown_role"])
def test_invalid_import_is_atomic(tmp_path, envelope, mutation):
    store = Store(tmp_path / "data.db")
    row = envelope["data"]["records"][0]
    if mutation == "duplicate":
        envelope["data"]["records"].append(deepcopy(row))
        envelope["data"]["total_records"] = 2
    elif mutation == "count":
        envelope["data"]["total_records"] = 2
    elif mutation == "group":
        envelope["data"]["dataset_group_id"] = "OTHER"
    elif mutation == "failure":
        envelope["isSuccess"] = False
    elif mutation == "timestamp":
        row["transcript"][1]["timestamp"] = "00:99"
    elif mutation == "backwards":
        row["transcript"][1]["timestamp"] = "01:00"
    elif mutation == "empty":
        row["transcript"] = []
    elif mutation == "timezone":
        row["channel"] = "voice call"
        row["transcript"] = [{"timestamp": "2026-10-01T12:00:00", "speaker": "client", "text": "Synthetic."}]
    else:
        row["transcript"][0]["speaker"] = "unknown"
    with pytest.raises(ValueError):
        import_dataset(store, envelope, "DEV")
    assert store.list("conversations") == []


def test_original_call_timezone_strings_preserved_without_demo_dates(tmp_path, envelope):
    row = envelope["data"]["records"][0]
    row["channel"] = "voice call"
    stamps = ["2026-06-09T14:00:00.000+06:00", "2026-06-09T08:00:05Z", "2026-06-09T14:00:10+06:00"]
    for turn, stamp in zip(row["transcript"], stamps):
        turn["timestamp"] = stamp
    store = Store(tmp_path / "data.db")
    import_dataset(store, envelope, "DEV", assign_demo_dates=False)
    saved = store.list("conversations")[0]
    assert [t["timestamp"] for t in saved["transcript"]] == stamps
    assert saved["observed_span"]["duration_seconds"] == 10
    assert saved["demo_started_at"] is None
    assert saved["scheduling"]["mode"] == "source_only"


def test_late_invalid_record_leaves_no_partial_import(tmp_path, envelope):
    second = deepcopy(envelope["data"]["records"][0])
    second["conversation_id"] = "fiction-002"
    second["transcript"][-1]["timestamp"] = "invalid"
    envelope["data"]["records"].append(second)
    envelope["data"]["total_records"] = 2
    store = Store(tmp_path / "data.db")
    with pytest.raises(ValueError):
        import_dataset(store, envelope, "DEV")
    assert store.list("conversations") == []
