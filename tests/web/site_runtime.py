#!/usr/bin/env python3
"""Verify website models and controllers against the pinned UI source package."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import os
import signal
import queue
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from dependencies import dependency
from library_catalog import collect_libraries, dynlex_catalog


def compilation_budget(name):
    # Dispatch and initial-route fixtures link the source workspace and 3D scene.
    return 600 if name in ['site_farm_controller', 'site_farm_profiles', 'site_farm_rebuilding', 'site_farm_labels', 'site_reply_ownership', 'site_startup', 'site_debugger'] else 180


def run_shipped_fixtures(project, jobs, models):
    sources = {source.relative_to(project).as_posix(): source.read_text()
               for source in project.rglob('*.dl')}
    request = project / 'browser-models.json'
    request.write_text(json.dumps({'sources': sources, 'jobs': jobs}))
    environment = dict(os.environ)
    environment.pop('DYNLEX_PROJECT_COMPILER', None)
    if os.name == 'nt' and not shutil.which('taskkill'):
        raise RuntimeError('Fixture cancellation requires Windows taskkill')
    options = ({'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt'
               else {'start_new_session': True})
    command = ['node', str(ROOT / 'scripts/compile_project.mjs'), str(request), str(project)]
    process = subprocess.Popen(command, cwd=ROOT, env=environment, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, encoding='utf-8', **options)
    messages = queue.Queue()

    def read_output():
        try:
            for line in process.stdout:
                messages.put(line)
        except Exception as error:
            messages.put(error)
        finally:
            messages.put(None)

    reader = threading.Thread(target=read_output, daemon=True)
    reader.start()
    deadline = time.monotonic() + sum(compilation_budget(Path(job['entry']).stem) for job in jobs)
    completed = 0
    try:
        while True:
            try:
                line = messages.get(timeout=max(0, deadline - time.monotonic()))
            except queue.Empty:
                raise subprocess.TimeoutExpired(command, 'fixture compilation budget') from None
            if isinstance(line, Exception):
                raise line
            if line is None:
                break
            print(line, end='', flush=True)
            if not line.startswith('Compiled '):
                continue
            if completed == len(jobs):
                raise RuntimeError('The compiler reported an unexpected extra artifact')
            job = jobs[completed]
            if not line.startswith(f'Compiled {job["entry"]} → {job["output"]} ('):
                raise RuntimeError(f'Unexpected compiler completion: {line.rstrip()}')
            name = Path(job['entry']).stem
            verify = ['node', str(ROOT / 'tests/web/site_model_runtime.mjs'),
                      str(project / job['output']), str(ROOT / f'tests/web/models/{name}.txt')] if name in models else [
                          'node', str(ROOT / f'tests/web/{name}.mjs'), str(project / job['output'])]
            subprocess.run(verify, cwd=ROOT, check=True, timeout=30)
            print(f'PASS {job["output"]}', flush=True)
            completed += 1
        result = process.wait(timeout=max(0, deadline - time.monotonic()))
        if result:
            raise subprocess.CalledProcessError(result, command)
        if completed != len(jobs):
            raise RuntimeError('The compiler exited before producing every fixture')
    finally:
        if process.poll() is None:
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], check=True,
                               stdout=subprocess.DEVNULL)
            else:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass  # The process can exit between poll and cancellation.
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired as error:
                if os.name == 'nt':
                    raise RuntimeError('taskkill completed but the compiler did not exit') from error
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
        reader.join(timeout=5)
        process.stdout.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compiler', type=Path, default=None)
    parser.add_argument('--frontend', choices=['all', 'native', 'shipped'], default='shipped',
                        help='Select a compiler frontend for preflight checks (default: both).')
    cases = ['site_program_commands', 'site_controllers', 'site_language', 'site_entry', 'site_shader', 'site_shader_loading', 'site_shader_buffers', 'site_program_events', 'site_river_controller', 'site_river_audio', 'site_progress_controller', 'site_account_profiles', 'site_account_controller', 'site_account_recovery', 'site_reply_ownership']
    cases.append('site_program_deadlines')
    cases.append('site_debugger')
    cases.append('site_startup')
    cases.append('site_theme_controller')
    cases.append('site_libraries')
    cases.append('site_farm_controller')
    cases.append('site_farm_profiles')
    cases.append('site_farm_rebuilding')
    cases.append('site_farm_annotations')
    cases.append('site_farm_labels')
    renderers = ['site_farm_renderer']
    cases.extend(renderers)
    models = ['site_shader_program', 'site_farm_interface', 'site_farm_landscape', 'site_farm_camera', 'site_farm_lighting', 'site_farm_materials', 'site_farm_characters', 'site_farm_fences', 'site_farm_flags', 'site_farm_areas']
    models.append('site_farm_picking')
    models.append('site_river_inspection_interface')
    models.append('site_farm_markers')
    models.append('site_farm_weather')
    models.append('site_farm_motion')
    parser.add_argument('--case', action='append', choices=cases + models)
    args = parser.parse_args()
    if args.frontend != 'shipped' and args.compiler is None:
        parser.error('--compiler is required for native frontend checks')
    selected = args.case or cases + models
    native_cases = selected if args.frontend in ['all', 'native'] else []
    shipped_cases = selected if args.frontend in ['all', 'shipped'] else []
    with tempfile.TemporaryDirectory(prefix='dynlex-site-test-') as directory:
        project = Path(directory)
        for source in (ROOT / 'site').rglob('*.dl'):
            target = project / source.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        for name in ('dynlex-ui', 'dynlex-ide'):
            dependency(name).extract(project / 'site/packages' / name)
        configuration = json.loads((ROOT / 'site/project.json').read_text())
        catalog = project / 'site/libraries/catalog.dl'
        catalog.write_text(dynlex_catalog(collect_libraries(configuration, dependency)))
        fixture = project / 'tests/web/site_fixture.dl'
        fixture.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / 'tests/web/site_fixture.dl', fixture)
        shutil.copyfile(ROOT / 'tests/web/site_account_support.dl', fixture.with_name('site_account_support.dl'))
        shutil.copyfile(ROOT / 'tests/web/studio_debug_fixture.dl', fixture.with_name('studio_debug_fixture.dl'))
        for name in selected:
            source = project / f'tests/web/{name}.dl'
            source.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / f'tests/web/{name}.dl', source)
        # These temporary source snapshots test controller behavior, not cache recording.
        for name in native_cases:
            source = project / f'tests/web/{name}.dl'
            if name in models:
                expected = (ROOT / f'tests/web/models/{name}.txt').read_text()
                for suffix, options in [('.out', ['-O0']), ('.optimized.out', ['-O2']), ('.wasm', ['--emit-wasm'])]:
                    binary = project / (name + suffix)
                    subprocess.run([str(args.compiler.resolve()), str(source), '--no-incremental', *options, '-o', str(binary)],
                                   cwd=ROOT, check=True, timeout=180)
                    if suffix == '.wasm':
                        subprocess.run(['node', str(ROOT / 'tests/web/site_model_runtime.mjs'), str(binary),
                                        str(ROOT / f'tests/web/models/{name}.txt')], cwd=ROOT, check=True, timeout=30)
                        print(f'PASS {name}{suffix}', flush=True)
                        continue
                    command = [str(binary)]
                    result = subprocess.run(command, cwd=ROOT, timeout=30, text=True, capture_output=True)
                    if result.returncode:
                        raise AssertionError(f'{name}{suffix}: exit {result.returncode}; stdout={result.stdout!r}; stderr={result.stderr!r}')
                    if result.stdout != expected:
                        raise AssertionError(f'{name}{suffix}: expected {expected!r}, got {result.stdout!r}')
                    print(f'PASS {name}{suffix}', flush=True)
                continue
            binary = project / f'{name}.wasm'
            optimization = '-O0' if name in renderers else '-O2'
            subprocess.run([str(args.compiler.resolve()), str(source), '--no-incremental', '--emit-wasm', optimization, '-o', str(binary)],
                           cwd=ROOT, check=True, timeout=compilation_budget(name))
            subprocess.run(['node', str(ROOT / f'tests/web/{name}.mjs'), str(binary)],
                           cwd=ROOT, check=True, timeout=30)
            if name in renderers:
                binary = project / f'{name}.optimized.wasm'
                subprocess.run([str(args.compiler.resolve()), str(source), '--no-incremental', '--emit-wasm', '-O2', '-o', str(binary)],
                               cwd=ROOT, check=True, timeout=180)
                subprocess.run(['node', str(ROOT / f'tests/web/{name}.mjs'), str(binary)],
                               cwd=ROOT, check=True, timeout=30)
        jobs = [{'entry': f'tests/web/{name}.dl', 'kind': 'wasm', 'output': f'{name}.browser.wasm'}
                for name in shipped_cases]
        if jobs:
            run_shipped_fixtures(project, jobs, models)


if __name__ == '__main__':
    main()
