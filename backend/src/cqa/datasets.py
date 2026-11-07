"""Validate immutable organizer sources and assign an independent demo schedule."""

import hashlib
import json
import random
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .models import SourceConversation, SourceEnvelope
from .storage import Store

DEMO_SEED = 2026
DEMO_TIMEZONE = "Asia/Almaty"


def conversation_key(dataset_id: str, conversation_id: str) -> str:
    return json.dumps([dataset_id, conversation_id], ensure_ascii=False, separators=(",", ":"))


def observed_span(record: SourceConversation) -> dict:
    stamps = [turn.timestamp for turn in record.transcript]
    if record.channel == "agent chat":
        if any(re.fullmatch(r"\d{2,}:[0-5]\d", stamp) is None for stamp in stamps):
            raise ValueError("Chat timestamps must be MM:SS with seconds from 00 to 59")
        values = [int(stamp.split(":")[0]) * 60 + int(stamp.split(":")[1]) for stamp in stamps]
        kind = "elapsed"
    else:
        values = []
        for stamp in stamps:
            try:
                parsed = datetime.fromisoformat(stamp)
            except ValueError as error:
                raise ValueError("Call timestamps must be ISO 8601 with a timezone") from error
            if "T" not in stamp or parsed.tzinfo is None or parsed.utcoffset() is None:
                raise ValueError("Call timestamps must be ISO 8601 with a timezone")
            values.append(parsed.timestamp())
        kind = "calendar"
    if any(right < left for left, right in zip(values, values[1:])):
        raise ValueError("Source timestamps must be in nondecreasing transcript order")
    return {"kind": kind, "started_at": stamps[0], "ended_at": stamps[-1], "duration_seconds": float(values[-1] - values[0])}


def _schedule(dataset_id: str, ids: list[str]) -> dict[str, str]:
    # Include only stable source identity: judgments, scores and source dates play no role.
    digest = hashlib.sha256(f"{DEMO_SEED}:{dataset_id}".encode()).digest()
    rng = random.Random(int.from_bytes(digest, "big"))
    shuffled = sorted(ids)
    rng.shuffle(shuffled)
    assigned = {}
    for index, id in enumerate(shuffled):
        start = datetime(2026, 10, index % 31 + 1, tzinfo=ZoneInfo(DEMO_TIMEZONE))
        # Alternate explicit night/day strata so modest cohorts cover both.
        hour = rng.randrange(0, 6) if index % 2 == 0 else rng.randrange(9, 18)
        assigned[id] = (start + timedelta(hours=hour, minutes=rng.randrange(60), seconds=rng.randrange(60))).isoformat()
    return assigned


def import_dataset(store: Store, payload: dict, group_id: str, assign_demo_dates: bool = True) -> dict:
    if not isinstance(group_id, str) or not group_id.strip():
        raise ValueError("group_id must be a nonempty string")
    if type(assign_demo_dates) is not bool:
        raise ValueError("assign_demo_dates must be a boolean")
    envelope = SourceEnvelope.model_validate(payload)
    data = envelope.data
    if not envelope.isSuccess or envelope.error:
        raise ValueError("Organizer envelope does not report success")
    if data.dataset_group_id != group_id:
        raise ValueError("Envelope dataset_group_id must match group_id")
    if data.total_records != len(data.records):
        raise ValueError("Envelope record count does not match total_records")
    ids = [record.conversation_id for record in data.records]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate source conversation IDs are not allowed within a dataset")
    dates = _schedule(group_id, ids) if assign_demo_dates else {}
    documents = {}
    for record in data.records:
        source = record.model_dump()
        documents[conversation_key(group_id, record.conversation_id)] = {
            **source, "dataset_id": group_id, "observed_span": observed_span(record),
            "demo_started_at": dates.get(record.conversation_id),
            "scheduling": {"mode": "assigned_demo" if assign_demo_dates else "source_only",
                           "seed": DEMO_SEED if assign_demo_dates else None,
                           "algorithm": "stratified-october-v1" if assign_demo_dates else None,
                           "timezone": DEMO_TIMEZONE, "period": "2026-10" if assign_demo_dates else None,
                           "independent_of_scores": True,
                           "interpretation": "Calendar filters describe assigned demonstration dates; source timestamps are unchanged." if assign_demo_dates else "No demonstration calendar is assigned; original timestamps are retained."},
        }
    store.insert_immutable("conversations", documents)
    return {"dataset_id": group_id, "total_records": len(documents), "assign_demo_dates": assign_demo_dates,
            "scheduling_seed": DEMO_SEED if assign_demo_dates else None}
