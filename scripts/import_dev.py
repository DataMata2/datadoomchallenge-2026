#!/usr/bin/env python3
"""Explicit import from a local JSON envelope or an env-configured source URL."""
import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

from _local_api import api_json


def configured_url(name, env_file):
    value = os.getenv(name)
    if value:
        return value
    if env_file:
        try:
            for line in Path(env_file).read_text().splitlines():
                match = re.fullmatch(r'\s*(?:export\s+)?' + re.escape(name) + r'\s*=\s*(.*?)\s*', line)
                if match:
                    value = match[1]
                    if len(value) > 1 and value[0] == value[-1] and value[0] in {'"', "'"}:
                        value = value[1:-1]
                    if value:
                        return value
        except OSError:
            raise ValueError('Cannot read the configured backend environment file') from None
    raise ValueError(f'Set {name}, use --env-file, or choose --source with a local JSON file')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument('--source', type=Path, help='Ignored local JSON source envelope')
    source.add_argument('--url-env', default='CQA_DEV_SOURCE_URL', help='Environment variable containing the organizer URL')
    parser.add_argument('--env-file', default=os.getenv('CQA_ENV_FILE'))
    parser.add_argument('--api-base', default='http://127.0.0.1:8000')
    parser.add_argument('--group', default='DEV')
    parser.add_argument('--source-dates-only', action='store_true')
    args = parser.parse_args()
    try:
        if args.source:
            try:
                payload = json.loads(args.source.read_text())
            except (OSError, ValueError):
                raise ValueError('Cannot read a valid JSON source envelope from the local file') from None
        else:
            url = configured_url(args.url_env, args.env_file)
            parts = urlsplit(url)
            if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password:
                raise ValueError('The organizer source must be an HTTPS URL without embedded credentials')
            try:
                with urlopen(url, timeout=60) as response:
                    payload = json.load(response)
            except Exception:
                raise ValueError('Cannot fetch a valid organizer source envelope; check the configured URL privately') from None
        result = api_json(args.api_base, '/api/datasets/import', {'group_id':args.group,'payload':payload,'assign_demo_dates':not args.source_dates_only})
        print(f"Imported dataset {result['dataset_id']}: {result['total_records']} records. No evaluation was started.")
    except ValueError as error:
        parser.exit(1, f'Import failed: {error}\n')


if __name__ == '__main__':
    main()
