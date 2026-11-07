"""Synthetic no-network regression checks for dispatch recovery and artifact validation."""
import json
import unittest
from copy import deepcopy
from types import SimpleNamespace
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from evaluate_results import run
from validate_results import validate_file
from local_model_comparison import raw_agrees
from cqa.exports import build_baseline_export
from cqa.rubric import default_checklist
from cqa.storage import Store


def settled_fixture(directory, error_count=1):
    from cqa.scoring import score_criteria
    store=Store(Path(directory)/'fixture.sqlite3')
    checklist=default_checklist()
    store.insert_immutable('checklists',{'cqa-v1':checklist})
    ids=['invented-001','invented-002']
    evaluations={}
    items=[]
    for index,id in enumerate(ids):
        source={'conversation_id':id,'dataset_id':'INVENTED','channel':'agent chat','language':'EN',
                'transcript':[{'speaker':'operator','timestamp':'00:00','text':'Manufactured greeting.'}]}
        store.put('conversations',id,source)
        judgments=[{'criterion_id':c['id'],'value':c['allowed_values'][-1],'rationale':'Invented test rationale','evidence_turns':[1]} for c in checklist['criteria']]
        failed=index>=len(ids)-error_count
        evaluation={'id':'evaluation-'+id,'dataset_id':'INVENTED','conversation_id':id,'run_id':'known-run',
                    'checklist_version_id':'cqa-v1','checklist_snapshot':checklist,'created_at':'2026-11-08T00:00:00Z',
                    'status':'error' if failed else 'ok','model':{'mode':'external_api','name':'fixture-only'},
                    'final':None if failed else score_criteria(checklist['criteria'],judgments,1),
                    'error':'Synthetic provider rejection; retained without retry' if failed else None}
        store.put('evaluations',evaluation['id'],evaluation)
        evaluations[evaluation['id']]=evaluation
        items.append({'conversation_id':id,'status':'failed' if failed else 'completed','evaluation_id':evaluation['id']})
    observed={'id':'known-run','kind':'evaluation','dataset_id':'INVENTED','conversation_ids':ids,
              'checklist_version_id':'cqa-v1','status':'failed' if error_count else 'completed','total':len(ids),
              'completed':len(ids)-error_count,'failed':error_count,'finished_at':'2026-11-08T00:00:00+00:00','items':items}
    state={'dataset_id':'INVENTED','expected_count':len(ids),'checklist_version_id':'cqa-v1',
           'conversation_ids':ids[:],'run_id':'known-run'}
    return store,observed,evaluations,state


def fixture_transport(observed,evaluations):
    def get(base,path,*body):
        if body:raise AssertionError('Resume must not POST or resend')
        if path=='/api/runs/known-run':return deepcopy(observed)
        if path.startswith('/api/evaluations/'):
            id=path.removeprefix('/api/evaluations/')
            if id not in evaluations:raise ValueError('Synthetic missing evaluation')
            return deepcopy(evaluations[id])
        raise AssertionError('Unexpected mocked read: '+path)
    return get


class DeliveryHelpersTest(unittest.TestCase):
    def test_scale_agreement_keeps_boolean_and_null_semantics(self):
        for left,right,expected in [(15,15.0,True),(False,0,False),(True,1,False),(None,None,True),(None,0,False),(None,False,False),(False,False,True)]:
            with self.subTest(left=left,right=right):
                self.assertIs(raw_agrees(left,right),expected)

    def test_unknown_dispatch_is_never_blindly_repeated(self):
        with TemporaryDirectory() as directory:
            path=Path(directory)/'state.json'
            page={'items':[{'conversation_id':'invented-001'}],'total':1}
            with patch('evaluate_results.api_json',side_effect=[page,ValueError('Unknown HTTP outcome')]) as api:
                with self.assertRaises(ValueError):run('http://127.0.0.1:8000','INVENTED',1,path)
                self.assertEqual(api.call_count,2)
            self.assertEqual(json.loads(path.read_text())['status'],'dispatching')
            with patch('evaluate_results.api_json') as api:
                with self.assertRaises(ValueError):run('http://127.0.0.1:8000','INVENTED',1,path)
                with self.assertRaises(ValueError):run('http://127.0.0.1:8000','INVENTED',1,path,True)
                api.assert_not_called()

    def test_known_run_resume_does_not_start_another_run(self):
        with TemporaryDirectory() as directory:
            _,observed,evaluations,state=settled_fixture(directory,error_count=0)
            path=Path(directory)/'state.json';path.write_text(json.dumps(state))
            with patch('evaluate_results.api_json',side_effect=fixture_transport(observed,evaluations)) as api:
                result=run('http://127.0.0.1:8000','INVENTED',2,path,True)
                self.assertEqual(result['run_id'],'known-run')
                self.assertTrue(result['export_ready'])
                self.assertEqual((result['success_count'],result['error_count']),(2,0))
                self.assertEqual(len(api.call_args_list),3)
                self.assertTrue(all(len(call.args)==2 for call in api.call_args_list))

    def test_settled_mixed_and_all_error_runs_resume_and_export_every_source(self):
        for error_count in (1,2):
            with self.subTest(error_count=error_count), TemporaryDirectory() as directory:
                store,observed,evaluations,state=settled_fixture(directory,error_count)
                path=Path(directory)/'state.json';path.write_text(json.dumps(state))
                with patch('evaluate_results.api_json',side_effect=fixture_transport(observed,evaluations)) as api:
                    result=run('http://127.0.0.1:8000','INVENTED',2,path,True)
                self.assertEqual(result['status'],'failed')
                self.assertTrue(result['export_ready'])
                self.assertEqual((result['success_count'],result['error_count']),(2-error_count,error_count))
                self.assertEqual(result['completed']+result['failed'],2)
                self.assertEqual(len(api.call_args_list),3)
                self.assertTrue(all(len(call.args)==2 for call in api.call_args_list))
                self.assertEqual(json.loads(path.read_text())['error_count'],error_count)
                jobs=SimpleNamespace(latest_evaluation=lambda dataset,id,checklist: next(e for e in evaluations.values() if e['conversation_id']==id))
                exported=build_baseline_export(store,jobs,'INVENTED','Fixture Team')
                self.assertEqual([r['conversation_id'] for r in exported['results']],state['conversation_ids'])
                errors=[r for r in exported['results'] if r['status']=='error']
                self.assertEqual(len(errors),error_count)
                self.assertTrue(all(r['score'] is None and r['criteria']==[] and r['error'].strip() for r in errors))

    def test_settled_resume_blocks_incomplete_unsent_or_mismatched_results(self):
        mutations=('missing_item','duplicate_item','unselected_item','missing_evaluation_id','missing_evaluation',
                   'queued_item','cancelled_item','interrupted_item','cancelled_run','interrupted_run',
                   'duplicate_selected_id','duplicate_run_id','wrong_total','wrong_counts','wrong_evaluation_source',
                   'wrong_evaluation_dataset','wrong_evaluation_run','wrong_evaluation_checklist','wrong_evaluation_status',
                   'wrong_evaluation_id','missing_final','missing_error')
        for mutation in mutations:
            with self.subTest(mutation=mutation), TemporaryDirectory() as directory:
                _,observed,evaluations,state=settled_fixture(directory)
                success=evaluations['evaluation-invented-001'];error=evaluations['evaluation-invented-002']
                if mutation=='missing_item':observed['items'].pop()
                if mutation=='duplicate_item':observed['items'][1]=deepcopy(observed['items'][0])
                if mutation=='unselected_item':observed['items'][1]['conversation_id']='other-source'
                if mutation=='missing_evaluation_id':observed['items'][1]['evaluation_id']=None
                if mutation=='missing_evaluation':del evaluations['evaluation-invented-002']
                if mutation in {'queued_item','cancelled_item','interrupted_item'}:observed['items'][1]['status']=mutation.removesuffix('_item')
                if mutation in {'cancelled_run','interrupted_run'}:observed['status']=mutation.removesuffix('_run')
                if mutation=='duplicate_selected_id':state['conversation_ids']=['invented-001','invented-001']
                if mutation=='duplicate_run_id':observed['conversation_ids']=['invented-001','invented-001']
                if mutation=='wrong_total':observed['total']=1
                if mutation=='wrong_counts':observed['completed']=0
                if mutation=='wrong_evaluation_source':error['conversation_id']='other-source'
                if mutation=='wrong_evaluation_dataset':error['dataset_id']='OTHER'
                if mutation=='wrong_evaluation_run':error['run_id']='other-run'
                if mutation=='wrong_evaluation_checklist':error['checklist_version_id']='other-checklist'
                if mutation=='wrong_evaluation_status':error['status']='ok'
                if mutation=='wrong_evaluation_id':error['id']='other-evaluation'
                if mutation=='missing_final':success['final']=None
                if mutation=='missing_error':error['error']=' '
                path=Path(directory)/'state.json';path.write_text(json.dumps(state))
                with patch('evaluate_results.api_json',side_effect=fixture_transport(observed,evaluations)) as api:
                    with self.assertRaises(ValueError):run('http://127.0.0.1:8000','INVENTED',2,path,True)
                self.assertTrue(all(len(call.args)==2 for call in api.call_args_list))
                self.assertFalse(json.loads(path.read_text()).get('export_ready',False))

    def test_validator_requires_current_values_exact_population_and_recomputed_score(self):
        from types import SimpleNamespace
        from cqa.scoring import score_criteria
        with TemporaryDirectory() as directory:
            database=Path(directory)/'fixture.sqlite3';store=Store(database)
            source={'conversation_id':'invented-001','dataset_id':'INVENTED','channel':'agent chat','language':'EN','transcript':[{'speaker':'operator','timestamp':'00:00','text':'Manufactured greeting.'}]}
            checklist=default_checklist();store.insert_immutable('checklists',{'cqa-v1':checklist});store.put('conversations','invented',source)
            judgments=[{'criterion_id':c['id'],'value':c['allowed_values'][-1],'rationale':'Invented test rationale','evidence_turns':[1]} for c in checklist['criteria']]
            scored=score_criteria(checklist['criteria'],judgments,1)
            evaluation={'id':'invented-evaluation','dataset_id':'INVENTED','conversation_id':'invented-001','checklist_version_id':'cqa-v1','checklist_snapshot':checklist,'created_at':'2026-11-08T00:00:00Z','status':'ok','model':{'mode':'external_api','name':'fixture-only'},'final':scored}
            store.put('evaluations',evaluation['id'],evaluation)
            jobs=SimpleNamespace(latest_evaluation=lambda *args:evaluation)
            document=build_baseline_export(store,jobs,'INVENTED','Fixture Team')
            path=Path(directory)/'results.json';path.write_text(json.dumps(document))
            self.assertEqual(validate_file(path,database,'INVENTED',1,'Fixture Team')['records'],1)
            document['results'][0]['score']['final_score']=0
            path.write_text(json.dumps(document))
            with self.assertRaises(ValueError):validate_file(path,database,'INVENTED',1,'Fixture Team')
            path.write_text(json.dumps(build_baseline_export(store,jobs,'INVENTED','Fixture Team')))
            with self.assertRaises(ValueError):validate_file(path,database,'INVENTED',10,'Fixture Team')
            with self.assertRaises(ValueError):validate_file(path,database,'INVENTED',1,'Wrong Team')

if __name__=='__main__':unittest.main()
