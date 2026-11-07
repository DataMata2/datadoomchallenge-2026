#!/usr/bin/env python3
"""One bounded cached-only Ollama comparison. Writes ignored artifacts, never product records."""
import argparse
import hashlib
import json
import os
import signal
import socket
import sqlite3
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend/src'))
from jsonschema import Draft202012Validator
from cqa.evaluations import Assessment, PROMPT_VERSION, SYSTEM
from cqa.prepare import model_job_lock
from cqa.provider import _finite_float, _unique_object
from cqa.scoring import score_criteria

RUN = '34f4496c-876a-4e03-9f6e-72c92d89a556'
CASES = ('p1-en-001','p1-en-013','p1-ru-025','p1-kz-014','p4-ru-002')
CHECKLIST_HASH = '2dc9102ae195a0d96e754b7c70972c0f380cea18a23844a555867f36eef3d974'
MODEL = 'cqa-qwen25-1p5b-local'
HOST = 'http://127.0.0.1:11435'
CACHE = Path('/home/datamata/.cache/huggingface/hub/models--Qwen--Qwen2.5-1.5B-Instruct/snapshots/989aa7980e4cf806f80c7fef2b1adb7bc71aa306')


def encoded(value):
    return json.dumps(value,ensure_ascii=False,allow_nan=False,sort_keys=True,separators=(',',':')).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def save(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False,allow_nan=False,indent=2)+'\n')


def strict_json(text):
    return json.loads(text,object_pairs_hook=_unique_object,parse_float=_finite_float,
        parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Non-finite JSON value')))


def raw_agrees(left, right):
    """Allowed scale numbers compare numerically; booleans and null stay distinct."""
    if left is None or right is None:
        return left is None and right is None
    if type(left) is bool or type(right) is bool:
        return type(left) is bool and type(right) is bool and left == right
    return type(left) in (int, float) and type(right) in (int, float) and left == right


def frozen(database):
    with sqlite3.connect(database.resolve().as_uri()+'?mode=ro',uri=True) as db:
        db.execute('PRAGMA query_only=ON'); db.execute('BEGIN')
        rows={}
        for collection,value in db.execute('SELECT collection,value FROM documents'):
            rows.setdefault(collection,[]).append(json.loads(value))
        active=[r['id'] for r in rows.get('runs',[]) if r['status'] in {'queued','running'} or r['status']=='cancelled' and r['finished_at'] is None]
        if active: raise ValueError('Application model jobs are active; quiesce before local comparison')
        ledger=next(r for r in rows['usage'] if 'attempts' in r)
        if any(r['reserved_usd'] for r in ledger['attempts'].values()): raise ValueError('Outstanding provider reservations must settle first')
        cases=[]
        for id in CASES:
            source=next(r for r in rows['conversations'] if r['dataset_id']=='DEV' and r['conversation_id']==id)
            evaluation=next(r for r in rows['evaluations'] if r['run_id']==RUN and r['conversation_id']==id)
            checklist=evaluation['checklist_snapshot']
            if evaluation['prompt_version']!=PROMPT_VERSION or digest(checklist)!=CHECKLIST_HASH or evaluation['model']['name']!='claude-sonnet-5-5':
                raise ValueError('Frozen historical identity changed')
            prompt=json.dumps({'schema_version':'1.0','prompt_version':PROMPT_VERSION,'checklist':checklist,
                'conversation':{k:source[k] for k in ('conversation_id','channel','language')} | {
                    'transcript':[{'turn_index':i,**turn} for i,turn in enumerate(source['transcript'],1)]}},ensure_ascii=False)
            attempt=[ledger['attempts'][i] for i in evaluation['usage_attempt_ids']]
            cases.append({'id':id,'source':source,'evaluation':evaluation,'prompt':prompt,'attempts':attempt})
        return cases, {'attempt_count':len(ledger['attempts']),'spent_usd':round(sum(r['cost_usd'] or 0 for r in ledger['attempts'].values()),8),
                       'reserved_usd':sum(r['reserved_usd'] for r in ledger['attempts'].values()),'ledger_sha256':digest(ledger)}


def api(path,body=None,timeout=5):
    request=Request(HOST+path,data=None if body is None else json.dumps(body,ensure_ascii=False).encode(),
        headers={'Content-Type':'application/json'},method='GET' if body is None else 'POST')
    with urlopen(request,timeout=timeout) as response:return json.load(response)


def sample(stop,path):
    with path.open('w') as out:
        while not stop.is_set():
            row={'monotonic':time.monotonic(),'utc':datetime.now(timezone.utc).isoformat()}
            mem={line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if line.split()[1].isdigit()}
            try: row['processors']=api('/api/ps',timeout=1)
            except Exception: row['processors']=None
            row['host_kib']={k:mem[k] for k in ('MemTotal','MemAvailable','SwapTotal','SwapFree')}
            try:
                gpu=subprocess.run(['nvidia-smi','--query-gpu=name,memory.used,memory.free,utilization.gpu','--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=3)
                row['gpu_sample']=gpu.stdout.strip() if gpu.returncode==0 else 'unavailable'
            except (OSError,subprocess.TimeoutExpired): row['gpu_sample']='unavailable'
            out.write(json.dumps(row)+'\n');out.flush();stop.wait(1)


def validate_case(result,case,stages):
    if result.get('done') is not True or result.get('done_reason')!='stop':
        raise ValueError('Request did not finish with a successful stop')
    stages['successful_stop']=True
    parsed=strict_json(result['message']['content']); stages['strict_json']=True
    Draft202012Validator(Assessment.model_json_schema()).validate(parsed);stages['original_schema']=True
    assessment=Assessment.model_validate(parsed);stages['strict_assessment']=True
    score=score_criteria(case['evaluation']['checklist_snapshot']['criteria'],[r.model_dump() for r in assessment.criteria],len(case['source']['transcript']))
    stages['strict_score_evidence']=True
    return stages,score


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,required=True)
    parser.add_argument('--model-dir',type=Path,default=CACHE,help='Original cached snapshot or reviewed regular-file staging copy')
    parser.add_argument('--budget-seconds',type=int,default=900,help='Total local lifecycle bound including cleanup, at most 900')
    parser.add_argument('--execute',action='store_true',help='Run the one cached-only attempt; otherwise freeze/describe offline')
    parser.add_argument('--output',type=Path,default=ROOT/'runtime/local-comparison')
    args=parser.parse_args()
    # One fixed configuration, no retry/repair/provider fallback. Entire lifecycle <=15 minutes.
    if not 60<=args.budget_seconds<=900:parser.error('Budget must be 60..900 seconds')
    model_dir=args.model_dir.resolve()
    if model_dir not in {CACHE.resolve(),(ROOT/'runtime/local-comparison/task7-staged-model').resolve()}:
        parser.error('Use only the named cached snapshot or reviewed project staging copy')
    started=time.monotonic();deadline=started+args.budget_seconds-25
    def expired(signum,frame): raise TimeoutError('Bounded lifecycle deadline reached; cleanup begins')
    signal.signal(signal.SIGALRM,expired)
    signal.alarm(args.budget_seconds-25)
    args.output.mkdir(parents=True,exist_ok=False)
    manifest={'started_at':datetime.now(timezone.utc).isoformat(),'baseline_run':RUN,'case_ids':CASES,'checklist_sha256':CHECKLIST_HASH,
        'system_sha256':hashlib.sha256(SYSTEM.encode()).hexdigest(),'schema_sha256':digest(Assessment.model_json_schema()),
        'configuration':{'model':MODEL,'cache':str(CACHE),'import_source':str(model_dir),'host':HOST,'num_ctx':16384,'num_predict':4096,'num_batch':128,'temperature':0,'seed':2026,'num_thread':6,
            'keep_alive':0,'truncate':False,'shift':False,'request_timeout_seconds':90,'total_deadline_seconds':args.budget_seconds,'max_primary_requests':5,'retries':0},
        'cases':[],'outcomes':[],'api_fee_usd':0,'operating_cost':'hardware/electricity/setup unmeasured'}
    server=None;sampler=None;stop=threading.Event()
    with model_job_lock(ROOT/'runtime/model-jobs.lock'):
        cases,before=frozen(args.database);manifest['billing_before']=before
        for case in cases:
            row={'id':case['id'],'source_sha256':digest(case['source']),'evaluation_id':case['evaluation']['id'],'original_sha256':digest(case['evaluation']['original']),
                 'prompt_sha256':hashlib.sha256(case['prompt'].encode()).hexdigest(),'prompt_utf8_bytes':len(case['prompt'].encode()),'turn_count':len(case['source']['transcript']),
                 'attempt_ids':case['evaluation']['usage_attempt_ids'],'claude_score':case['evaluation']['original']['final_score'],
                 'claude_latency_ms':[a['latency_ms'] for a in case['attempts']],'claude_cost_usd':sum(a['cost_usd'] or 0 for a in case['attempts'])}
            manifest['cases'].append(row)
        save(args.output/'manifest.json',manifest)
        if not args.execute:
            print(json.dumps({'status':'frozen_offline','cases':manifest['cases']}));return
        try:
            with socket.socket() as probe: probe.bind(('127.0.0.1',11435))
            if not (model_dir/'model.safetensors').is_file(): raise ValueError('Named cached weights are absent; downloading is forbidden')
            # Hash once while reading locally. No remote source/model names are used.
            h=hashlib.sha256()
            with (model_dir/'model.safetensors').open('rb') as weights:
                for chunk in iter(lambda:weights.read(8*1024*1024),b''):h.update(chunk)
            manifest['source_weight_sha256']=h.hexdigest()
            env=os.environ.copy();env.update(OLLAMA_HOST='127.0.0.1:11435',OLLAMA_MODELS=str(args.output.resolve()/'models'),OLLAMA_NO_CLOUD='1',OLLAMA_NUM_PARALLEL='1',OLLAMA_MAX_LOADED_MODELS='1',OLLAMA_CONTEXT_LENGTH='16384',OLLAMA_LOAD_TIMEOUT='90s')
            log=(args.output/'server.log').open('w')
            server=subprocess.Popen(['ollama','serve'],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            manifest['owned_server_pid']=server.pid
            sampler=threading.Thread(target=sample,args=(stop,args.output/'resource-samples.jsonl'),daemon=True);sampler.start()
            for _ in range(40):
                if server.poll() is not None:raise ValueError('Owned Ollama server exited at startup; inspect ignored server.log')
                try:manifest['server_version']=api('/api/version');break
                except Exception:time.sleep(.25)
            else:raise ValueError('Ollama did not become ready within 10 seconds')
            modelfile=args.output/'Modelfile'
            modelfile.write_text('FROM '+str(model_dir)+'\nTEMPLATE """{{ range .Messages }}<|im_start|>{{ .Role }}\n{{ .Content }}<|im_end|>\n{{ end }}<|im_start|>assistant\n"""\nPARAMETER stop "<|im_end|>"\nPARAMETER stop "<|endoftext|>"\n')
            import_started=time.monotonic()
            with (args.output/'import.log').open('w') as import_log:
                imported=subprocess.run(['ollama','create',MODEL,'-f',str(modelfile)],env=env,stdout=import_log,stderr=subprocess.STDOUT,timeout=min(180,deadline-time.monotonic()))
            manifest['import_seconds']=time.monotonic()-import_started
            if imported.returncode:raise ValueError('Cached Safetensors import failed; inspect ignored import.log')
            manifest['show']=api('/api/show',{'model':MODEL});manifest['tags']=api('/api/tags')
            show=manifest['show']
            if show.get('details',{}).get('family')!='qwen2' or show.get('details',{}).get('quantization_level') not in {'F16','BF16'}:
                raise ValueError('Imported architecture/precision differs from the unquantized Qwen2 plan')
            if '<|im_end|>' not in show.get('parameters','') or '<|endoftext|>' not in show.get('parameters','') or '<|im_start|>' not in show.get('template',''):
                raise ValueError('Imported template/stops differ from plan')
            manifest['setup_seconds']=time.monotonic()-started
            save(args.output/'manifest.json',manifest)
            for case in cases:
                if time.monotonic()+90>deadline:raise TimeoutError('Total experiment deadline leaves no full request window')
                row={'id':case['id'],'validation':{}};call_started=time.monotonic()
                body={'model':MODEL,'messages':[{'role':'system','content':SYSTEM},{'role':'user','content':case['prompt']}],
                    'format':Assessment.model_json_schema(),'stream':False,'keep_alive':0,'truncate':False,'shift':False,
                    'options':{k:manifest['configuration'][k] for k in ('num_ctx','num_predict','num_batch','temperature','seed','num_thread')}}
                save(args.output/(case['id']+'-request.json'),body)
                try:
                    result=api('/api/chat',body,timeout=90)
                    save(args.output/(case['id']+'-response.json'),result)
                    row['metrics']={k:result.get(k) for k in ('done','done_reason','model','total_duration','load_duration','prompt_eval_count','prompt_eval_duration','eval_count','eval_duration')}
                    # Imported metadata plus running processor metadata retained even when keep_alive=0 unloads before polling.
                    row['processors_after']=api('/api/ps')
                    stages,score=validate_case(result,case,row['validation']);row.update(validation=stages,status='valid',score=score)
                    pairs=[]
                    for local,baseline in zip(sorted(score['criteria'],key=lambda r:r['criterion_id']),sorted(case['evaluation']['original']['criteria'],key=lambda r:r['criterion_id'])):
                        pairs.append({'criterion_id':local['criterion_id'],'claude_value':baseline['value'],'local_value':local['value'],
                            'value_agrees':raw_agrees(local['value'],baseline['value']),
                            'applicability_agrees':local['applicable']==baseline['applicable'],
                            'claude_evidence':baseline['evidence_turns'],'local_evidence':local['evidence_turns'],
                            'evidence_overlap':sorted(set(local['evidence_turns'])&set(baseline['evidence_turns']))})
                    row['pairs']=pairs;row['score_delta']=round(score['final_score']-case['evaluation']['original']['final_score'],2)
                except Exception as error:
                    row.update(status='failed',error_type=type(error).__name__,error=str(error))
                row['wall_seconds']=time.monotonic()-call_started;manifest['outcomes'].append(row)
                save(args.output/'manifest.json',manifest)
                print(json.dumps({'id':case['id'],'status':row['status'],'wall_seconds':round(row['wall_seconds'],3),'error':row.get('error')}),flush=True)
                # A timed-out request can keep running: never send another primary request then.
                if row.get('error_type') in {'TimeoutError','URLError'}:break
        except Exception as error:
            manifest['failure']={'type':type(error).__name__,'message':str(error)}
            print(json.dumps({'status':'experiment_failed','failure':manifest['failure']}),flush=True)
        finally:
            signal.alarm(0)
            if server is not None:
                try:os.killpg(server.pid,signal.SIGTERM)
                except ProcessLookupError:pass
                try:server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(server.pid,signal.SIGKILL);server.wait(timeout=5)
                manifest['server_returncode']=server.returncode
            stop.set()
            if sampler is not None:sampler.join(timeout=5)
            manifest['sampler_stopped']=sampler is None or not sampler.is_alive()
            _,after=frozen(args.database);manifest['billing_after']=after
            manifest['canonical_billing_unchanged']=before==after
            manifest['elapsed_seconds']=time.monotonic()-started
            manifest['finished_at']=datetime.now(timezone.utc).isoformat()
            save(args.output/'manifest.json',manifest)
            print(json.dumps({'artifact':str(args.output/'manifest.json'),'elapsed_seconds':round(manifest['elapsed_seconds'],3),'billing_unchanged':before==after,'sampler_stopped':manifest['sampler_stopped']}),flush=True)

if __name__=='__main__':main()
