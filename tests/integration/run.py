#!/usr/bin/env python3
"""Run every website integration fixture using the pinned compiler and runtime."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from dependencies import dependency, unpack

unpack('dynlex-web')
sources = {p.relative_to(ROOT).as_posix():p.read_text()
           for folder in ['site', 'tests/integration'] for p in (ROOT / folder).rglob('*.dl')}
sources.update(dependency('dynlex-ui').source_files('site/packages/dynlex-ui'))
fixtures = sorted((ROOT / 'tests/integration').glob('*/main.dl'))
with tempfile.TemporaryDirectory(prefix='dynlex-website-integration-') as directory:
    stage = Path(directory)
    request = stage / 'request.json'
    request.write_text(json.dumps({'sources': sources, 'jobs': [
        {'entry': p.relative_to(ROOT).as_posix(), 'kind':'wasm', 'output':p.parent.name+'.wasm'}
        for p in fixtures]}))
    subprocess.run(['node',str(ROOT / 'scripts/compile_project.mjs'),str(request),str(stage)],check=True)
    for source in fixtures:
        expected = (source.parent / 'expected.txt').read_text() if (source.parent / 'expected.txt').exists() else ''
        result = subprocess.run(['node',str(ROOT / 'scripts/run_program.mjs'),str(stage / (source.parent.name+'.wasm'))],check=True,capture_output=True,text=True,timeout=30)
        if result.stdout != expected:
            raise AssertionError(f'{source.parent.name}: expected {expected!r}, got {result.stdout!r}')
        print(f'PASS {source.parent.name}',flush=True)
print(f'{len(fixtures)} website integration fixtures passed.')
