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


def exact_ids(values,expected_count,label='Selected source IDs'):
    if (not isinstance(values,list) or len(values)!=expected_count
            or any(type(id) is not str or not id for id in values)
            or len(set(values))!=expected_count):
        raise ValueError(label+' must be nonempty unique strings at the expected count')
    return set(values)


def settled_counts(api_base,observed,selected,expected_count):
    if observed['status'] not in {'completed','failed'} or observed.get('kind')!='evaluation':
        raise ValueError('Cancelled/interrupted or nonbaseline work cannot proceed to baseline export')
    items=observed.get('items')
    if (not isinstance(items,list) or type(observed.get('total')) is not int or observed['total']!=expected_count
            or exact_ids([item['conversation_id'] for item in items],expected_count)!=selected):
        raise ValueError('Settled run items must cover the complete selected source population exactly once')
    success_count=sum(item['status']=='completed' for item in items)
    error_count=sum(item['status']=='failed' for item in items)
    if success_count+error_count!=expected_count:
        raise ValueError('Unsent, cancelled or interrupted items lack a complete durable baseline; inspect without resending')
    if (type(observed['completed']) is not int or type(observed['failed']) is not int
            or (observed['completed'],observed['failed'])!=(success_count,error_count)):
        raise ValueError('Settled run success/error counts disagree with its source items')
    exact_ids([item.get('evaluation_id') for item in items],expected_count,'Durable evaluation IDs')
    for item in items:
        evaluation_id=item['evaluation_id']
        evaluation=api_json(api_base,'/api/evaluations/'+quote(evaluation_id,safe=''))
        identity={'id':evaluation_id,'dataset_id':observed['dataset_id'],
                  'conversation_id':item['conversation_id'],'run_id':observed['id'],
                  'checklist_version_id':'cqa-v1',
                  'status':'ok' if item['status']=='completed' else 'error'}
        if any(evaluation.get(key)!=value for key,value in identity.items()):
            raise ValueError('Durable evaluation identity/status differs from its selected baseline item')
        if item['status']=='completed' and evaluation.get('final') is None:
            raise ValueError('Successful item is missing its durable final assessment')
        if item['status']=='failed' and (not isinstance(evaluation.get('error'),str) or not evaluation['error'].strip()):
            raise ValueError('Error evaluations require a durable nonempty reason before export')
    return success_count,error_count


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
        if page['total']!=expected_count:
            raise ValueError('Complete source population does not match the explicit expected count')
        exact_ids(ids,expected_count)
        state={'dataset_id':dataset,'expected_count':expected_count,'checklist_version_id':'cqa-v1','conversation_ids':ids,'status':'dispatching','run_id':None}
        save(state_path,state,exclusive=True)
        # Any network failure leaves an unknown dispatch marker; no automatic resend.
        created=api_json(api_base,'/api/runs',{'dataset_id':dataset,'conversation_ids':ids,'checklist_version_id':'cqa-v1'})
        state.update(run_id=created['id'],status=created['status']);save(state_path,state)
        print('Started baseline run '+created['id'],flush=True)
    selected=exact_ids(state.get('conversation_ids'),expected_count)
    if state.get('checklist_version_id')!='cqa-v1':raise ValueError('Saved dispatch is not the cqa-v1 baseline')
    deadline=time.monotonic()+wait_seconds
    while True:
        observed=api_json(api_base,'/api/runs/'+quote(state['run_id'],safe=''))
        if (observed['id']!=state['run_id'] or observed['dataset_id']!=dataset
                or observed['checklist_version_id']!='cqa-v1'
                or exact_ids(observed['conversation_ids'],expected_count)!=selected):
            raise ValueError('Observed run identity differs from the saved dispatch')
        state.update(status=observed['status'],completed=observed['completed'],failed=observed['failed'],finished_at=observed['finished_at'],export_ready=False);save(state_path,state)
        if observed['finished_at'] is not None:
            success_count,error_count=settled_counts(api_base,observed,selected,expected_count)
            state.update(success_count=success_count,error_count=error_count,export_ready=True);save(state_path,state)
            print(json.dumps({k:state[k] for k in ('run_id','status','success_count','error_count','export_ready')}),flush=True)
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
