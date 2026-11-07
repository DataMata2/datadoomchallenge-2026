#!/usr/bin/env python3
"""Read-only validation against the exact current baseline population and original sources."""
import argparse
import json
import sqlite3
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend/src'))
from cqa.evaluations import latest_evaluations
from cqa.exports import build_baseline_export, validate_baseline_export
from cqa.provider import _finite_float, _unique_object


class ReadOnlyStore:
    def __init__(self,connection):self.connection=connection
    def get(self,collection,id):
        row=self.connection.execute('SELECT value FROM documents WHERE collection=? AND id=?',(collection,id)).fetchone()
        return json.loads(row[0]) if row else None
    def list(self,collection):
        return [json.loads(row[0]) for row in self.connection.execute('SELECT value FROM documents WHERE collection=? ORDER BY id',(collection,))]


def validate_file(path,database,dataset,expected_count,team_name):
    document=json.loads(path.read_text(),object_pairs_hook=_unique_object,parse_float=_finite_float,
        parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Non-finite JSON value')))
    with sqlite3.connect(database.resolve().as_uri()+'?mode=ro',uri=True) as connection:
        connection.execute('PRAGMA query_only=ON');connection.execute('BEGIN')
        store=ReadOnlyStore(connection)
        sources=[r for r in store.list('conversations') if r['dataset_id']==dataset]
        if len(sources)!=expected_count:raise ValueError('Dataset count does not match the explicit expected count')
        validated=validate_baseline_export(document,sources)
        latest=latest_evaluations(store,dataset,'cqa-v1')
        class Current:
            def latest_evaluation(self,dataset_id,id,checklist_version_id):
                return latest.get(id)
        current=build_baseline_export(store,Current(),dataset,team_name)
        if validated!=current:raise ValueError('Artifact differs from current baseline evaluations or official metadata; export explicitly then validate again')
        return {'dataset':dataset,'records':len(validated['results']),'ok':sum(r['status']=='ok' for r in validated['results']),
                'errors':sum(r['status']=='error' for r in validated['results']),'team_name':validated['team_name'],'model':validated['model'],'schema_version':validated['schema_version']}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--database',type=Path,required=True)
    parser.add_argument('--dataset',required=True)
    parser.add_argument('--expected-count',type=int,required=True)
    parser.add_argument('--team-name',required=True)
    args=parser.parse_args()
    try:
        if args.expected_count<1:raise ValueError('Expected count must be positive')
        result=validate_file(args.input,args.database,args.dataset,args.expected_count,args.team_name)
    except Exception as error:
        # Pydantic can include rejected input; do not echo source-derived content.
        parser.exit(1,f'Validation failed ({type(error).__name__}); check dataset count, exact IDs, schema, evidence, arithmetic and current export metadata.\n')
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':main()
