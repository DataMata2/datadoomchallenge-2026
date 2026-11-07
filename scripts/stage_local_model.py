#!/usr/bin/env python3
"""Copy only the reviewed local cached model files; no symlinks, download or cache mutation."""
import hashlib
import json
import shutil
import sys
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend/src'))
from cqa.prepare import model_job_lock

CACHE=Path('/home/datamata/.cache/huggingface/hub/models--Qwen--Qwen2.5-1.5B-Instruct/snapshots/989aa7980e4cf806f80c7fef2b1adb7bc71aa306')
HUB=Path('/home/datamata/.cache/huggingface/hub').resolve()
OUTPUT=ROOT/'runtime/local-comparison/task7-staged-model'
FILES=('model.safetensors','config.json','generation_config.json','tokenizer.json','tokenizer_config.json','vocab.json','merges.txt')
WEIGHT_SHA='dd924a11b4c220f385b51ffa522daea7c9f3d850e31b162bb5661df483c6d3ee'


def sha(path):
    result=hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda:source.read(8*1024*1024),b''):result.update(chunk)
    return result.hexdigest()


def main():
    started=time.monotonic()
    with model_job_lock(ROOT/'runtime/model-jobs.lock'):
        if OUTPUT.exists():raise SystemExit('Existing staging output must be inspected; do not overwrite')
        originals={}
        for name in FILES:
            source=(CACHE/name).resolve(strict=True)
            if not source.is_relative_to(HUB) or not source.is_file():raise SystemExit('Unexpected cache target; stop for review')
            originals[name]={'path':str(source),'sha256':sha(source),'bytes':source.stat().st_size}
        if originals['model.safetensors']['sha256']!=WEIGHT_SHA:raise SystemExit('Verified source weight hash changed')
        OUTPUT.mkdir(parents=True,exist_ok=False)
        for name,row in originals.items():
            target=OUTPUT/name
            shutil.copyfile(row['path'],target,follow_symlinks=True)
            if target.is_symlink() or not target.is_file() or sha(target)!=row['sha256']:raise SystemExit('Regular staging copy verification failed')
        result={'classification':'reviewed packaging repair only; no model invocation','files':originals,'elapsed_seconds':time.monotonic()-started,'weight_sha256':WEIGHT_SHA}
        (OUTPUT.parent/'task7-staging-manifest.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps({'regular_files':len(FILES),'elapsed_seconds':result['elapsed_seconds'],'weight_sha256':WEIGHT_SHA}))

if __name__=='__main__':main()
