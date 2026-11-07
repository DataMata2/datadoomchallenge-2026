from concurrent.futures import ThreadPoolExecutor

import pytest

from cqa.storage import Store


def test_persistence_reopening_and_isolation(tmp_path):
    path = tmp_path / "store.sqlite3"
    store = Store(path)
    store.put("counts", "one", {"value": 0})
    store.put("other", "one", {"value": 2})
    assert Store(path).get("counts", "one") == {"value": 0}
    assert Store(path).get("counts", "absent") is None
    assert store.list("counts") == [{"value": 0}]


def test_atomic_concurrent_update_and_rollback(tmp_path):
    store = Store(tmp_path / "store.sqlite3")
    store.put("counts", "one", {"value": 0})
    def increment(_):
        store.update("counts", "one", lambda row: {"value": row["value"] + 1})
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(increment, range(40)))
    assert store.get("counts", "one") == {"value": 40}
    def fail(row):
        row["value"] = 999
        raise ValueError("Synthetic rollback")
    with pytest.raises(ValueError):
        store.update("counts", "one", fail)
    assert store.get("counts", "one") == {"value": 40}
    with pytest.raises(KeyError):
        store.update("counts", "absent", lambda row: row)


def test_immutable_batch_rolls_back_and_rejects_overwrite(tmp_path):
    store = Store(tmp_path / "store.sqlite3")
    store.insert_immutable("sources", {"one": {"value": 1}})
    with pytest.raises(ValueError):
        store.insert_immutable("sources", {"two": {"value": 2}, "one": {"value": 3}})
    assert store.get("sources", "two") is None
    assert store.get("sources", "one") == {"value": 1}
