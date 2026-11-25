#!/usr/bin/env python3
"""Prepare isolated compiler-service tests without compiling the website UI."""
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from dependencies import dependency, unpack

output = ROOT / 'build/worker-fixture'
compiler = unpack('dynlex-web')
if output.exists():
    shutil.rmtree(output)
shutil.copytree(compiler / 'src/web/compiler', output / 'compiler')
artifacts = compiler / 'src/web/ide/public/compiler'
for source in [*artifacts.glob('runtime*.js'), *(artifacts / name for name in [
        'dynlex_web.js', 'dynlex_web.wasm', 'dynlex_wgsl_translator.wasm'])]:
    shutil.copy2(source, output / 'compiler' / source.name)
shutil.copy2(compiler / 'web/wgsl-translator.js', output / 'compiler/wgsl-translator.js')
(output / 'sdk-sources.json').write_text(json.dumps(dependency('dynlex-ui').source_files('packages/dynlex-ui')))
(output / '__tests__').mkdir()
shutil.copy2(ROOT / 'tests/web/site_worker_checks.mjs', output / '__tests__/workers.mjs')
shutil.copy2(ROOT / 'tests/web/fixtures/delayed-worker.mjs', output / '__tests__/delayed-worker.mjs')
(output / 'index.html').write_text('<!doctype html><title>Compiler service tests</title>')
print(output)
