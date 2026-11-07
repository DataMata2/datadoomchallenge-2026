"""Small local-only HTTP helpers. Error strings never include request URLs."""
import json
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def local_base(value: str) -> str:
    parts = urlsplit(value)
    if parts.scheme != 'http' or parts.hostname not in {'127.0.0.1', 'localhost', '::1'} or parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError('The API base must be a local HTTP URL without credentials or query parameters')
    return value.rstrip('/')


def api_json(base: str, path: str, body=None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    request = Request(local_base(base) + path, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urlopen(request, timeout=60) as response:
            return json.load(response)
    except HTTPError as error:
        # The API sanitizes validation errors, but a proxy may not. Do not echo it.
        raise ValueError(f'Local API returned HTTP {error.code}; inspect the local API and input validation') from None
    except Exception:
        raise ValueError('Cannot read the local API; start scripts/dev.sh and check the API address') from None
