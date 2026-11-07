"""Synthetic no-network regression checks for dispatch recovery and artifact validation."""
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from evaluate_results import run
from validate_results import validate_file
from local_model_comparison import raw_agrees
from cqa.exports import build_baseline_export
from cqa.rubric import default_checklist
from cqa.storage import Store


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
            path=Path(directory)/'state.json'
            path.write_text(json.dumps({'dataset_id':'INVENTED','expected_count':1,'conversation_ids':['invented-001'],'run_id':'known-run'}))
            settled={'id':'known-run','dataset_id':'INVENTED','conversation_ids':['invented-001'],'checklist_version_id':'cqa-v1','status':'completed','completed':1,'failed':0,'finished_at':'2026-11-08T00:00:00+00:00'}
            with patch('evaluate_results.api_json',return_value=settled) as api:
                self.assertEqual(run('http://127.0.0.1:8000','INVENTED',1,path,True)['run_id'],'known-run')
                api.assert_called_once_with('http://127.0.0.1:8000','/api/runs/known-run')

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
