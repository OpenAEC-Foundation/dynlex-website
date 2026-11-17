"""Check fail-fast verification and compiler reuse without compiling the compiler."""
import importlib.util
from pathlib import Path
import subprocess
import os
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('site_runtime', ROOT / 'tests/web/site_runtime.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class FixtureRunner(unittest.TestCase):
    def prepare(self, folder, compiler, verifier):
        root = Path(folder)
        (root / 'scripts').mkdir()
        (root / 'tests/web').mkdir(parents=True)
        project = root / 'project'
        project.mkdir()
        (root / 'scripts/compile_project.mjs').write_text(compiler)
        for name in ['a', 'b']:
            (root / f'tests/web/{name}.mjs').write_text(verifier)
        jobs = [{'entry': f'tests/web/{name}.dl', 'kind': 'wasm', 'output': f'{name}.browser.wasm'}
                for name in ['a', 'b']]
        return root, project, jobs

    def test_verification_runs_before_next_artifact_in_one_compiler_process(self):
        compiler = '''
import fs from 'node:fs/promises';import path from 'node:path';
if(process.env.DYNLEX_PROJECT_COMPILER)throw new Error('The shipped frontend used the native build override');
const {jobs}=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
for(const job of jobs) {
  const file=path.join(process.argv[3],job.output);await fs.writeFile(file,'complete');
  console.log(`Compiled ${job.entry} → ${job.output} (1 ms)`);
  let verified=false;
  for(let attempt=0;attempt<100;attempt++) {
    try {await fs.access(file+'.verified');verified=true;break;} catch(error) {if(error.code!=='ENOENT')throw error;}
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  if(!verified)throw new Error('The fixture was not verified before compiling the next artifact');
}
'''
        verifier = '''
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
assert.equal(await fs.readFile(process.argv[2],'utf8'),'complete');
await fs.writeFile(process.argv[2]+'.verified','yes');
'''
        with tempfile.TemporaryDirectory() as folder:
            root, project, jobs = self.prepare(folder, compiler, verifier)
            with patch.object(runner, 'ROOT', root), patch.dict(os.environ, {'DYNLEX_PROJECT_COMPILER':'/not-the-shipped-compiler'}):
                runner.run_shipped_fixtures(project, jobs, [])
            self.assertTrue(all((project / (job['output'] + '.verified')).exists() for job in jobs))

    def test_verifier_failure_stops_and_reaps_the_compiler(self):
        compiler = '''
console.log('Compiled tests/web/a.dl → a.browser.wasm (1 ms)');
setInterval(()=>{},1000);
'''
        with tempfile.TemporaryDirectory() as folder:
            root, project, jobs = self.prepare(folder, compiler, 'process.exit(7);')
            processes = []
            original = subprocess.Popen

            def capture(*args, **kwargs):
                process = original(*args, **kwargs)
                processes.append(process)
                return process

            with patch.object(runner, 'ROOT', root), patch.object(runner.subprocess, 'Popen', capture):
                with self.assertRaises(subprocess.CalledProcessError) as failure:
                    runner.run_shipped_fixtures(project, jobs, [])
            self.assertEqual(failure.exception.returncode, 7)
            self.assertIsNotNone(processes[0].poll(), 'The failed fixture left its compiler running')


if __name__ == '__main__':
    unittest.main()
