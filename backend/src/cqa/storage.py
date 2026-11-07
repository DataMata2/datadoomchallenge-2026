"""Small durable JSON store with one SQLite connection per short operation."""

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Iterator


def _encode(value: dict) -> str:
    if not isinstance(value, dict):
        raise ValueError("Stored documents must be objects")
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


class Store:
    def __init__(self, path: str | Path):
        if str(path) == ":memory:":
            raise ValueError("Store requires a file path because connections are short-lived")
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.execute("PRAGMA journal_mode=DELETE")
            connection.execute("CREATE TABLE IF NOT EXISTS documents (collection TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(collection, id))")

    @contextmanager
    def _connection(self, *, write: bool = False) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        try:
            connection.execute("PRAGMA busy_timeout=10000")
            if write:
                connection.execute("BEGIN IMMEDIATE")
            yield connection
            if write:
                connection.commit()
        except BaseException:
            if write:
                connection.rollback()
            raise
        finally:
            connection.close()

    def get(self, collection: str, id: str) -> dict | None:
        with self._connection() as connection:
            row = connection.execute("SELECT value FROM documents WHERE collection=? AND id=?", (collection, id)).fetchone()
        return json.loads(row[0]) if row else None

    def put(self, collection: str, id: str, value: dict) -> None:
        encoded = _encode(value)
        with self._connection(write=True) as connection:
            connection.execute("INSERT INTO documents VALUES (?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET value=excluded.value", (collection, id, encoded))

    def list(self, collection: str) -> list[dict]:
        with self._connection() as connection:
            rows = connection.execute("SELECT value FROM documents WHERE collection=? ORDER BY id", (collection,)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def update(self, collection: str, id: str, fn: Callable[[dict], dict]) -> dict:
        """Apply a local callback atomically. The callback must perform no network I/O."""
        with self._connection(write=True) as connection:
            row = connection.execute("SELECT value FROM documents WHERE collection=? AND id=?", (collection, id)).fetchone()
            if row is None:
                raise KeyError(id)
            value = fn(json.loads(row[0]))
            encoded = _encode(value)
            connection.execute("UPDATE documents SET value=? WHERE collection=? AND id=?", (encoded, collection, id))
        return json.loads(encoded)

    def insert_immutable(self, collection: str, documents: dict[str, dict]) -> None:
        """Insert an entire validated batch or nothing; identical reimports are safe."""
        encoded = {id: _encode(value) for id, value in documents.items()}
        with self._connection(write=True) as connection:
            for id, value in encoded.items():
                existing = connection.execute("SELECT value FROM documents WHERE collection=? AND id=?", (collection, id)).fetchone()
                if existing is not None and existing[0] != value:
                    raise ValueError("Import conflicts with an immutable stored source record")
                connection.execute("INSERT OR IGNORE INTO documents VALUES (?, ?, ?)", (collection, id, value))
