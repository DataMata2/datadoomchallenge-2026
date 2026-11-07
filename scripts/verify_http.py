#!/usr/bin/env python3
"""Read-only HTTP checks of prepared source/evaluations/analytics and Vite proxy."""
import argparse
import json
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import urlopen

from _local_api import api_json, local_base


def verify(base,frontend,dataset,expected_count):
    if api_json(base,'/api/health')!={'status':'ok'}:raise ValueError('API health failed')
    meta=api_json(base,'/api/meta')
    dataset_row=next(r for r in meta['datasets'] if r['id']==dataset)
    if dataset_row['total_records']!=expected_count:raise ValueError('Unexpected source population')
    if meta['reporting_timezone']!='Asia/Almaty':raise ValueError('Unexpected reporting timezone')
    spec={'title':'Read-only verification','filters':{'dataset_id':dataset,'start_at':'2026-10-01T00:00:00+05:00','end_at':'2026-11-01T00:00:00+05:00'},'group_by':'day_night','metric_ids':['final_score','dialogue','critical']}
    analysis=api_json(base,'/api/analytics',spec)
    sources=api_json(base,'/api/conversations/search',spec['filters'])
    if analysis['counts']['selected']!=expected_count or sources['total']!=expected_count:raise ValueError('Assigned October population differs')
    observations={r['conversation_id']:r for r in analysis['observations']}
    for source in sources['items']:
        row=observations[source['conversation_id']]
        if row['evaluation_status']!='ok' or row['final'] is None:raise ValueError('Prepared baseline evaluation is incomplete')
        for judgment in row['final']['criteria']:
            if not judgment['evidence_turns'] or any(type(i) is not int or not 1<=i<=len(source['transcript']) for i in judgment['evidence_turns']):
                raise ValueError('Evidence does not refer to full original source turns')
    # Inspect the exact immutable source and linked current evaluation for declared demo IDs.
    demos=[]
    for id in ('p1-en-001','p1-en-006','p1-en-013'):
        if id not in observations:continue
        source=api_json(base,'/api/conversations/'+quote(id,safe='')+'?'+urlencode({'dataset_id':dataset,'checklist_version_id':'cqa-v1'}))
        evaluation=api_json(base,'/api/evaluations/'+quote(source['evaluation_id'],safe=''))
        if evaluation['final']!=observations[id]['final']:raise ValueError('Analytics copied values differ from inspected current evaluation')
        demos.append({'id':id,'evaluation_id':evaluation['id'],'original_score':evaluation['original']['final_score'],'final_score':evaluation['final']['final_score'],'appeals':len(evaluation['appeals']),'critical':evaluation['final']['critical_flag']})
    proxy=api_json(frontend,'/api/analytics',spec)
    if proxy['counts']!=analysis['counts'] or proxy['groups']!=analysis['groups']:raise ValueError('Frontend proxy analytics differs from backend')
    with urlopen(local_base(frontend),timeout=5) as response:
        if response.status!=200 or b'<div id="root"></div>' not in response.read():raise ValueError('Frontend HTML entry failed')
    reports=api_json(base,'/api/reports')
    return {'classification':'read-only HTTP/API verification; no browser visual QA or model call',
        'dataset':dataset,'counts':analysis['counts'],'reporting_timezone':meta['reporting_timezone'],
        'filter_interpretation':analysis['filter_interpretation'],
        'groups':[{'key':g['key'],'counts':g['counts'],'metrics':g['metrics']} for g in analysis['groups']],
        'demonstration_cases':demos,'saved_reports':reports['total'],'proxy_matches':True,'frontend_html_status':200}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-base',default='http://127.0.0.1:8000')
    parser.add_argument('--frontend-base',default='http://127.0.0.1:5173')
    parser.add_argument('--dataset',required=True)
    parser.add_argument('--expected-count',type=int,required=True)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    try:result=verify(args.api_base,args.frontend_base,args.dataset,args.expected_count)
    except Exception as error:parser.exit(1,f'HTTP verification failed ({type(error).__name__}); inspect the local API state.\n')
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':main()
