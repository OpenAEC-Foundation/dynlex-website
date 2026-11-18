"""Resolve the website's locked, content-addressed dependency packages."""
import json
from pathlib import Path
import tempfile
from source_package import SourcePackage

ROOT = Path(__file__).resolve().parents[1]


def dependency(name):
    lock = json.loads((ROOT / 'site/project.json').read_text())['dependencies'][name]
    package = SourcePackage(ROOT / 'site' / lock['archive'])
    if package.manifest['package'] != name or package.manifest['contentHash'] != lock['contentHash']:
        raise ValueError(f'The {name} package does not match the dependency lock')
    return package


def site_sources():
    sources = {path.relative_to(ROOT).as_posix(): path.read_text()
               for path in (ROOT / 'site').rglob('*.dl')}
    for name in ('dynlex-ui', 'dynlex-ide'):
        sources.update(dependency(name).source_files(f'site/packages/{name}'))
    return sources


def unpack(name):
    package = dependency(name)
    directory = ROOT / '.cache/packages' / name / package.manifest['contentHash']
    if not directory.exists():
        directory.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=directory.parent) as temporary:
            stage = Path(temporary) / 'package'
            package.extract(stage)
            stage.rename(directory)
    return directory


if __name__ == '__main__':
    print(unpack('dynlex-web'))
