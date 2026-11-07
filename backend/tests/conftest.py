import pytest


@pytest.fixture
def envelope():
    return {
        "error": "", "isSuccess": True,
        "data": {
            "dataset_group_id": "DEV", "total_records": 1,
            "records": [{
                "conversation_id": "fiction-001", "channel": "agent chat", "language": "EN",
                "transcript": [
                    {"timestamp": "00:00", "speaker": "system", "text": "Synthetic start."},
                    {"timestamp": "00:02", "speaker": "client", "text": "Synthetic question."},
                    {"timestamp": "00:05", "speaker": "operator", "text": "Synthetic answer."},
                ],
                "audio_url": None,
            }],
        },
    }


@pytest.fixture
def analytics_data(tmp_path, envelope):
    """Small explicitly synthetic records; never touches the prepared runtime DB."""
    from copy import deepcopy
    from types import SimpleNamespace

    from cqa.datasets import conversation_key, import_dataset
    from cqa.evaluations import Evaluator
    from cqa.rubric import default_checklist
    from cqa.scoring import score_criteria
    from cqa.storage import Store

    store = Store(tmp_path / 'analytics.db')
    store.insert_immutable('checklists', {'cqa-v1': default_checklist()})

    def add(id, stamp='2026-10-01T12:00:00+05:00', *, language='RU', channel='agent chat', status='ok', values=None, created_at='2026-11-01T00:00:00+00:00'):
        payload = deepcopy(envelope)
        record = payload['data']['records'][0]
        record.update(conversation_id=id, language=language, channel=channel)
        if channel == 'voice call':
            for turn in record['transcript']:
                turn['timestamp'] = '2025-01-01T09:00:00+05:00'
        import_dataset(store, payload, 'DEV', assign_demo_dates=stamp is not None)
        key = conversation_key('DEV', id)
        row = store.get('conversations', key)
        row['demo_started_at'] = stamp
        store.put('conversations', key, row)
        evaluation = None
        if status != 'unevaluated':
            judgments = []
            for criterion in default_checklist()['criteria']:
                value = False if criterion['critical'] else (True if criterion['answer_type'] == 'boolean' else max(criterion['allowed_values']))
                judgments.append({'criterion_id': criterion['id'], 'value': (values or {}).get(criterion['id'], value),
                                  'rationale': 'Synthetic evidence.', 'evidence_turns': [3]})
            score = score_criteria(default_checklist()['criteria'], judgments, 3) if status == 'ok' else None
            evaluation = Evaluator(store, SimpleNamespace(model='synthetic'))._save(row, default_checklist(), 'synthetic-run', 'synthetic', score, [], 'Synthetic error' if status == 'error' else None)
            evaluation['created_at'] = created_at
            store.put('evaluations', evaluation['id'], evaluation)
        return row, evaluation

    return store, add
