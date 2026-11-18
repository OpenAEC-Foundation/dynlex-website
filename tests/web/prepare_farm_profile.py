#!/usr/bin/env python3
"""Measure production Farm navigation, saves, scene uploads and WebGL rendering."""
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from dependencies import dependency, unpack, site_sources


def run(*command, **options):
    subprocess.run(command, cwd=ROOT, check=True, **options)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--program', type=Path, default=ROOT / 'build/site/assets/games/farm/program.json')
    parser.add_argument('--browser', action='store_true', help='Also time actual WebGL2 work in a private browser')
    args = parser.parse_args()
    program = args.program.resolve()
    if not program.is_file():
        parser.error('Build the website first, or select its Farm program.json with --program')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    unpack('dynlex-web')
    sdk = dependency('dynlex-ui')
    sdk.extract(output / 'packages/dynlex-ui')
    sources = site_sources()
    names = ['navigation', 'save', 'scene']
    jobs = []
    for name in names:
        entry = f'tests/web/farm_{name}_benchmark.dl'
        sources[entry] = (ROOT / entry).read_text()
        jobs.append({'entry': entry, 'kind': 'wasm', 'output': f'{name}.wasm'})
    request = output / 'request.json'
    request.write_text(json.dumps({'sources': sources, 'jobs': jobs}))
    run('node', str(ROOT / 'scripts/compile_project.mjs'), str(request), str(output))
    request.unlink()
    for name in names:
        with (output / f'{name}.json').open('w') as report:
            run('node', str(ROOT / f'tests/web/farm_{name}_benchmark.mjs'), str(output / f'{name}.wasm'), stdout=report)
    with (output / 'save-fragmented.json').open('w') as report:
        run('node', str(ROOT / 'tests/web/farm_save_benchmark.mjs'), str(output / 'save.wasm'), '--holes=2000', stdout=report)
    run('node', str(ROOT / 'tests/web/capture_farm_benchmark.mjs'), str(output / 'scene.wasm'), str(program), str(output / 'scene.json'))
    shutil.copy2(ROOT / 'tests/web/farm_gpu_profile.mjs', output / 'farm_gpu_profile.mjs')
    (output / 'index.html').write_text('<!doctype html><title>Farm GPU timing</title><link rel="icon" href="data:,">')
    (output / 'profiles.json').write_text(json.dumps([
        {'name': 'current', 'data': '/scene.json', 'packageRoot': '/packages/dynlex-ui'}]))
    if args.browser:
        with socket.socket() as server, socket.socket() as debug:
            server.bind(('127.0.0.1', 0))
            debug.bind(('127.0.0.1', 0))
            ports = server.getsockname()[1], debug.getsockname()[1]
        environment = dict(os.environ, DYNLEX_TEST_WEB_ROOT=str(output), DYNLEX_TEST_GRAPHICS='webgl',
                           DYNLEX_TEST_SERVER_PORT=str(ports[0]), DYNLEX_TEST_DEBUG_PORT=str(ports[1]),
                           DYNLEX_PROFILE_OUTPUT=str(output),
                           DYNLEX_BROWSER_TEST_ENTRY=str(ROOT / 'tests/web/farm_gpu_profile_driver.mjs'))
        run(str(ROOT / 'scripts/test_web_browser.sh'), env=environment)
    print(f'Farm timing reports: {output}')


if __name__ == '__main__':
    main()
