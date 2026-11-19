#!/usr/bin/env python3
"""Build the DynLex website from its page and shader descriptions and a pinned UI SDK."""
import argparse
import html
import json
import os
import posixpath
from pathlib import Path
import shutil
import subprocess
import tempfile
from urllib.parse import unquote, urlsplit

from dependencies import dependency, unpack, site_sources


def compile_jobs(root, sources, jobs, stage):
    request = stage / 'compile-request.json'
    request.write_text(json.dumps({'sources': sources, 'jobs': jobs}))
    subprocess.run(['node', str(root / 'scripts/compile_project.mjs'), str(request), str(stage)], check=True)
    request.unlink()


def run_json(root, program, payload=None):
    command = ['node', str(root / 'scripts/run_program.mjs'), str(program)]
    if payload is not None:
        files = program.parent / 'runtime-files.json'
        files.write_text(json.dumps({'/input.json': json.dumps(payload)}))
        command.append(str(files))
    result = subprocess.run(command,
                            check=True, text=True, capture_output=True)
    if payload is not None:
        files.unlink()
    return json.loads(result.stdout)


def asset_base(value):
    parsed = urlsplit(value)
    decoded = unquote(value, errors='strict')
    if (not value.startswith('/') or decoded.startswith('//') or not value.endswith('/')
            or '\\' in decoded or any(ord(character) < 32 or ord(character) == 127 for character in decoded)
            or parsed.path != value or parsed.query or parsed.fragment
            or (decoded != '/' and posixpath.normpath(decoded) + '/' != decoded)):
        raise ValueError('The asset base must be a normalized root-relative URL ending in /')
    return value


def write_routes(site, stage, pages, base, fonts):
    template = (site / 'shell.html').read_text().replace('{{asset_root}}', html.escape(base, quote=True))
    preloads = [f'<link rel="preload" href="{html.escape(base, quote=True)}application.wasm" as="fetch" type="application/wasm" crossorigin>']
    preloads += [f'<link rel="preload" href="{html.escape(base + source, quote=True)}" as="font" type="font/woff2" crossorigin>'
                 for source in dict.fromkeys(font['source'] for font in fonts)]
    template = template.replace('{{preloads}}', '\n  '.join(preloads))
    for page in pages:
        route = page['path'].removeprefix('/')
        target = stage / route
        target.parent.mkdir(parents=True, exist_ok=True)
        source = template.replace('DynLex — Make the language part of the work', html.escape(page['title']))
        source = source.replace('Explore working sketches, invent project vocabulary, and run DynLex in the browser.',
                                html.escape(page['description'], quote=True))
        target.write_text(source)
    (stage / 'routes.json').write_text(json.dumps(pages, indent=2) + '\n')


def copy_public_files(site, stage):
    for source in sorted((site / 'public').rglob('*')):
        if source.is_file():
            target = stage / source.relative_to(site / 'public')
            if target.exists():
                raise FileExistsError(target)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)


def publish_site(stage, output):
    if output.exists():
        shutil.rmtree(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(stage, output)
    # The private staging directory's mode is preserved by copytree.
    output.chmod(0o755)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('build/site'))
    parser.add_argument('--base', type=asset_base, default=os.environ.get('DYNLEX_WEB_BASE', '/'))
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    site = root / 'site'
    output = args.output.resolve()
    project = json.loads((site / 'project.json').read_text())
    sdk = dependency('dynlex-ui')
    compiler_root = unpack('dynlex-web')
    sources = site_sources()
    (root / 'build').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='dynlex-site-build-', dir=root / 'build') as temporary:
        stage = Path(temporary)
        compile_jobs(root, sources, [
            {'entry': 'site/shaders/export.dl', 'kind': 'wasm', 'output': 'shader-catalog.wasm'},
            {'entry': 'site/pages/export.dl', 'kind': 'wasm', 'output': 'page-catalog.wasm'},
            {'entry': 'site/shaders/link.dl', 'kind': 'wasm', 'output': 'shader-linker.wasm'},
            {'entry': 'site/games/farm/export_renderer.dl', 'kind': 'wasm', 'output': 'farm-linker.wasm'}
        ], stage)
        scenes = run_json(root, stage / 'shader-catalog.wasm')
        pages = run_json(root, stage / 'page-catalog.wasm')
        (stage / 'shader-catalog.wasm').unlink()
        (stage / 'page-catalog.wasm').unlink()
        jobs = [{'entry': project['entry'], 'kind': 'wasm', 'output': 'application.wasm'}]
        for scene in scenes:
            for shader_stage in scene['stages']:
                jobs.append({'entry': scene['source'], 'kind': 'shader', 'stage': shader_stage,
                             'output': f"assets/shaders/{scene['id']}.{shader_stage}"})
        farm_stages = [
            ('environment', 'site/games/farm/shaders/environment.dl', 'fragment'),
            ('surface-vertex', 'site/games/farm/shaders/vertex.dl', 'vertex'),
            ('surface-fragment', 'site/games/farm/shaders/surface.dl', 'fragment'),
            ('shadow', 'site/games/farm/shaders/shadow.dl', 'vertex'),
            ('post', 'site/games/farm/shaders/post.dl', 'fragment'),
            ('scattering', 'site/packages/dynlex-ui/ui/shaders/environment_dfg.dl', 'fragment')
        ]
        for name, entry, shader_stage in farm_stages:
            jobs.append({'entry': entry, 'kind': 'shader', 'stage': shader_stage,
                         'output': f'assets/games/farm/{name}'})
        compile_jobs(root, sources, jobs, stage)
        farm = {}
        for name, _, _ in farm_stages:
            prefix = stage / f'assets/games/farm/{name}'
            farm[name] = {**json.loads(prefix.with_suffix('.json').read_text()),
                          'webgpu': prefix.with_suffix('.wgsl').read_text(),
                          'webgl': prefix.with_suffix('.glsl').read_text()}
            for suffix in ['.json', '.wgsl', '.glsl']:
                prefix.with_suffix(suffix).unlink()
        program = run_json(root, stage / 'farm-linker.wasm', farm)
        (stage / 'assets/games/farm/program.json').write_text(json.dumps(program) + '\n')
        (stage / 'farm-linker.wasm').unlink()
        linked = []
        for scene in scenes:
            stages = {}
            for shader_stage in scene['stages']:
                prefix = f"assets/shaders/{scene['id']}.{shader_stage}"
                stages[shader_stage] = {
                    'webgpu': prefix + '.wgsl', 'webgl': prefix + '.glsl',
                    **json.loads((stage / (prefix + '.json')).read_text())
                }
            linked.append({'id': scene['id'], 'stages': stages})
        programs = run_json(root, stage / 'shader-linker.wasm', linked)
        (stage / 'shader-linker.wasm').unlink()
        for scene, program in zip(scenes, programs, strict=True):
            scene['program'] = program
            shutil.copyfile(root / scene['source'], stage / f"assets/shaders/{scene['id']}.dl")
        sdk.extract(stage / 'packages/dynlex-ui')
        shutil.copytree(site / 'assets', stage / 'assets', dirs_exist_ok=True)
        shutil.copytree(site / 'platform', stage / 'platform')
        shutil.copytree(compiler_root / 'src/web/compiler', stage / 'compiler')
        compiler = compiler_root / 'src/web/ide/public/compiler'
        for name in ['dynlex_web.js', 'dynlex_web.wasm', 'dynlex_wgsl_translator.wasm']:
            shutil.copy2(compiler / name, stage / 'compiler' / name)
        for path in sorted({compiler / 'runtimeImports.js', *compiler.glob('runtime*.js')}):
            shutil.copy2(path, stage / 'compiler' / path.name)
        shutil.copy2(compiler_root / 'web/wgsl-translator.js', stage / 'compiler/wgsl-translator.js')
        write_routes(site, stage, pages, args.base, project["fonts"])
        (stage / 'assets/shaders/index.json').write_text(json.dumps(scenes) + '\n')
        dependencies = sdk.source_files('packages/dynlex-ui')
        editor = dependency('dynlex-ide')
        dependencies.update({name: data for name, data in editor.source_files('packages/dynlex-ide').items()
                             if name.startswith('packages/dynlex-ide/editor/')})
        editor.extract(stage / 'packages/dynlex-ide')
        dependencies.update({p.relative_to(root).as_posix(): p.read_text() for p in (site / 'language').glob('*.dl')})
        (stage / 'sdk-sources.json').write_text(json.dumps(dependencies) + '\n')
        libraries = {path.relative_to(compiler_root).as_posix(): path.read_text()
                     for path in (compiler_root / 'lib').rglob('*.dl')}
        (stage / 'assets/studio-library.json').write_text(json.dumps(libraries | dependencies) + '\n')
        shutil.copy2(compiler_root / 'scripts/install_release.sh', stage / 'install.sh')
        (stage / 'install.sh').chmod(0o755)
        shutil.copytree(compiler_root / 'resources/branding', stage / 'assets/branding', dirs_exist_ok=True)
        (stage / 'application.json').write_text(json.dumps({'module': 'application.wasm', 'fonts': project['fonts']}, indent=2) + '\n')
        copy_public_files(site, stage)
        subprocess.run(['node', str(stage / 'packages/dynlex-ui/tools/wasm_delivery.mjs'), str(stage / 'application.wasm')], check=True)
        subprocess.run(['node', str(root / 'scripts/prepare_delivery.mjs'), str(stage)], check=True)
        publish_site(stage, output)
    print(f'Built DynLex site: {output}')


if __name__ == '__main__':
    main()
