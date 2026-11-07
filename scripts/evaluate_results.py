#!/usr/bin/env python3
"""Explicitly start or resume one baseline API run. Never automatically retry dispatch."""
import argparse
import json
import os
import tempfile
import time
from pathlib import Path
from urllib.parse import quote, urlencode

from _local_api import api_json


def save(path,state,exclusive=False):
    path.parent.mkdir(parents=True,exist_ok=True)
    if exclusive:
        with path.open('x') as output:
            json.dump(state,output,indent=2);output.write('\n');output.flush();os.fsync(output.fileno())
        return
    with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,prefix='.'+path.name,delete=False) as output:
        temporary=Path(output.name)
        json.dump(state,output,indent=2);output.write('\n');output.flush();os.fsync(output.fileno())
    os.replace(temporary,path)


def run(api_base,dataset,expected_count,state_path,resume=False,wait_seconds=1800):
    if expected_count<1 or wait_seconds<1:raise ValueError('Expected count and wait deadline must be positive')
    if resume:
        state=json.loads(state_path.read_text())
        if state['dataset_id']!=dataset or state['expected_count']!=expected_count or not state.get('run_id'):
            raise ValueError('State has no matching known run ID; inspect API runs before any new dispatch')
    else:
        if state_path.exists():raise ValueError('State exists; use --resume for its known run, or inspect an unknown dispatch before choosing a new state')
        page=api_json(api_base,'/api/conversations?'+urlencode({'dataset_id':dataset,'page_size':500,'checklist_version_id':'cqa-v1'}))
        ids=[row['conversation_id'] for row in page['items']]
        if page['total']!=expected_count or len(ids)!=expected_count or len(set(ids))!=len(ids):
            raise ValueError('Complete source population does not match the explicit expected count')
        state={'dataset_id':dataset,'expected_count':expected_count,'checklist_version_id':'cqa-v1','conversation_ids':ids,'status':'dispatching','run_id':None}
        save(state_path,state,exclusive=True)
        # Any network failure leaves an unknown dispatch marker; no automatic resend.
        created=api_json(api_base,'/api/runs',{'dataset_id':dataset,'conversation_ids':ids,'checklist_version_id':'cqa-v1'})
        state.update(run_id=created['id'],status=created['status']);save(state_path,state)
        print('Started baseline run '+created['id'],flush=True)
    deadline=time.monotonic()+wait_seconds
    while True:
        observed=api_json(api_base,'/api/runs/'+quote(state['run_id'],safe=''))
        if observed['dataset_id']!=dataset or observed['checklist_version_id']!='cqa-v1' or set(observed['conversation_ids'])!=set(state['conversation_ids']):
            raise ValueError('Observed run identity differs from the saved dispatch')
        state.update(status=observed['status'],completed=observed['completed'],failed=observed['failed'],finished_at=observed['finished_at']);save(state_path,state)
        if observed['finished_at'] is not None:
            print(json.dumps({k:state[k] for k in ('run_id','status','completed','failed')}),flush=True)
            if observed['status']!='completed' or observed['failed'] or observed['completed']!=expected_count:
                raise ValueError('Run settled without a complete successful baseline; inspect retained items without automatic retry')
            return state
        if time.monotonic()>=deadline:raise ValueError('Polling deadline reached; resume this known run with --resume; it was not cancelled or resent')
        time.sleep(2)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset',required=True)
    parser.add_argument('--expected-count',type=int,required=True)
    parser.add_argument('--state',type=Path,required=True,help='Ignored durable run marker; never reuse for a new dispatch')
    parser.add_argument('--resume',action='store_true')
    parser.add_argument('--wait-seconds',type=int,default=1800)
    parser.add_argument('--api-base',default='http://127.0.0.1:8000')
    args=parser.parse_args()
    try:run(args.api_base,args.dataset,args.expected_count,args.state,args.resume,args.wait_seconds)
    except (OSError,ValueError,KeyError) as error:parser.exit(1,'Evaluation stopped: '+str(error)+'\n')

if __name__=='__main__':main()
