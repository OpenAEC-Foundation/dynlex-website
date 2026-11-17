#!/usr/bin/env python3
"""Compile the DynLex Farm catalog into its checked-in language vocabulary."""
import argparse
from pathlib import Path
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    destination = root / 'site/language/farm_challenge.dl'
    (root / 'build').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='farm-vocabulary-', dir=root / 'build') as temporary:
        program = Path(temporary) / 'language.wasm'
        import json
        from dependencies import unpack
        unpack('dynlex-web')
        sources = {p.relative_to(root).as_posix():p.read_text() for folder in ['site/games/farm','scripts/farm_vocabulary'] for p in (root/folder).glob('*.dl')}
        request = Path(temporary) / 'request.json'
        request.write_text(json.dumps({'sources':sources,'jobs':[{'entry':'scripts/farm_vocabulary/language.dl','kind':'wasm','output':'language.wasm'}]}))
        subprocess.run(['node',str(root/'scripts/compile_project.mjs'),str(request),temporary],cwd=root,check=True)
        text = subprocess.run(['node',str(root/'scripts/run_program.mjs'),str(program)],cwd=root,check=True,capture_output=True,text=True).stdout
    changed = not destination.exists() or destination.read_text() != text
    if args.check:
        if changed:
            print(f'Out of date: {destination.relative_to(root)}')
        return int(changed)
    if changed:
        staged = destination.with_suffix('.dl.new')
        staged.write_text(text)
        staged.replace(destination)
    print('Generated the Farm language vocabulary from DynLex.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
