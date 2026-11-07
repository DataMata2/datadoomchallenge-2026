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
