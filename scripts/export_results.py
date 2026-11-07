#!/usr/bin/env python3
"""Export backend-validated baseline results without starting model work."""
import argparse
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import quote, urlencode

from _local_api import api_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--team-name', required=True)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--api-base', default='http://127.0.0.1:8000')
    args = parser.parse_args()
    temporary = None
    try:
        if not args.team_name.strip():
            raise ValueError('The team name must contain non-whitespace text')
        result = api_json(args.api_base, '/api/exports/' + quote(args.dataset, safe='') + '?' + urlencode({'team_name':args.team_name,'checklist_version_id':'cqa-v1'}))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=args.output.parent, prefix='.'+args.output.name, delete=False) as output:
            temporary = Path(output.name)
            json.dump(result, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.write('\n')
        os.replace(temporary, args.output)
        print(f"Exported {len(result['results'])} validated baseline records to {args.output}.")
    except (OSError, ValueError) as error:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        parser.exit(1, f'Export failed: {error}\n')


if __name__ == '__main__':
    main()
