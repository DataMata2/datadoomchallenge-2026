"""Full dev.sh lifecycle regressions in a disposable checkout; no ports or DB."""
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
import unittest

SCRIPT = Path(__file__).with_name('dev.sh')


class DevLifecycleTest(unittest.TestCase):
    def run_lifecycle(self, mode):
        with tempfile.TemporaryDirectory(prefix='cqa-dev-lifecycle-') as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'frontend/node_modules/.bin').mkdir(parents=True)
            shutil.copyfile(SCRIPT, root / 'scripts/dev.sh')
            shutil.copyfile(SCRIPT.with_name('dev.py'), root / 'scripts/dev.py')
            interpreter = root / 'mock-python'
            interpreter.write_text('''#!/usr/bin/env python3
import os,pathlib,signal,sys,time,shutil
root=pathlib.Path(os.environ['CQA_LIFECYCLE_ROOT'])
mode=os.environ['CQA_LIFECYCLE_MODE']
if sys.argv[1]=='-':
    source=sys.stdin.read()
    if 'urllib.request' in source:
        deadline=time.monotonic()+2
        while not (root/'backend-started').exists():
            if time.monotonic()>deadline:sys.exit(1)
            time.sleep(.01)
        if mode.startswith('startup_'):
            (root/'signal-sent').write_text(mode)
            os.kill(os.getppid(),getattr(signal,'SIG'+mode.split('_')[1]))
    sys.exit(0)
(root/'backend-started').write_text(str(os.getpid()))
os.execl(shutil.which('sleep'),'sleep','30')
''')
            interpreter.chmod(0o755)
            vite = root / 'frontend/node_modules/.bin/vite'
            vite.write_text('''#!/usr/bin/env python3
import os,pathlib,time,shutil
root=pathlib.Path(os.environ['CQA_LIFECYCLE_ROOT'])
(root/'vite-started').write_text(str(os.getpid()))
if os.environ['CQA_LIFECYCLE_MODE']=='normal_exit':
    deadline=time.monotonic()+5
    while not (root/'finish-vite').exists():
        if time.monotonic()>deadline:raise SystemExit(2)
        time.sleep(.01)
else:
    os.execl(shutil.which('sleep'),'sleep','30')
''')
            vite.chmod(0o755)
            env = {
                'PATH': os.environ['PATH'],
                'CQA_DATABASE_PATH': str(root / 'runtime/disposable.sqlite3'),
                'CQA_MODEL_LOCK': str(root / 'runtime/model-jobs.lock'),
                'CQA_PYTHON': str(interpreter),
                'CQA_LIFECYCLE_ROOT': str(root),
                'CQA_LIFECYCLE_MODE': mode,
            }
            owner = subprocess.Popen(['bash', 'scripts/dev.sh'], cwd=root, env=env,
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                     text=True, start_new_session=True)
            try:
                deadline = time.monotonic() + 2
                marker = 'signal-sent' if mode.startswith('startup_') else 'vite-started'
                while not (root / marker).exists():
                    if owner.poll() is not None:
                        self.fail('Owner exited before lifecycle trigger: ' + owner.communicate()[0])
                    self.assertLess(time.monotonic(), deadline, 'Lifecycle fixture did not reach its trigger')
                    time.sleep(.01)
                if mode == 'normal_exit':
                    duplicate = subprocess.run(['bash', 'scripts/dev.sh'], cwd=root, env=env,
                                               capture_output=True, text=True, timeout=2)
                    self.assertEqual(duplicate.returncode, 1)
                    self.assertIn('already owns this database', duplicate.stderr)
                    (root / 'finish-vite').touch()
                try:
                    output = owner.communicate(timeout=2)[0]
                except subprocess.TimeoutExpired:
                    self.fail(f'{mode}: owner continued after cancellation; Vite started: {(root / "vite-started").exists()}')
                expected = {'startup_TERM': 143, 'startup_INT': 130, 'normal_exit': 0}[mode]
                self.assertEqual(owner.returncode, expected, output)
                if mode.startswith('startup_'):
                    self.assertFalse((root / 'vite-started').exists(), 'Vite must not launch after startup cancellation')
                for marker in ('backend-started', 'vite-started'):
                    if (root / marker).exists():
                        pid = int((root / marker).read_text())
                        with self.assertRaises(ProcessLookupError, msg=f'{mode}: {marker} child must be terminated and reaped'):
                            os.kill(pid, 0)
                self.assertNotIn('not a pid or valid job spec', output)
            finally:
                # Only this disposable process group is eligible for cleanup.
                try:
                    os.killpg(owner.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    owner.communicate(timeout=2)
                except subprocess.TimeoutExpired:
                    os.killpg(owner.pid, signal.SIGKILL)
                    owner.communicate(timeout=2)

    def test_term_during_successful_readiness_stops_startup(self):
        self.run_lifecycle('startup_TERM')

    def test_int_during_successful_readiness_stops_startup(self):
        self.run_lifecycle('startup_INT')

    def test_normal_child_exit_cleans_up_the_other_child(self):
        self.run_lifecycle('normal_exit')


if __name__ == '__main__':
    unittest.main()
