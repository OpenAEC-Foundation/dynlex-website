"""Retain content-addressed SDK archives outside disposable website releases."""
import argparse
from pathlib import Path
import shutil
import tempfile


def publish_libraries(root):
    pool = root / 'libraries'
    pool.mkdir(exist_ok=True)
    pool.chmod(0o755)
    for release in sorted((root / 'releases').iterdir()):
        for source in sorted((release / 'libraries').glob('*/*.zip')):
            target = pool / source.relative_to(release / 'libraries')
            target.parent.mkdir(exist_ok=True)
            target.parent.chmod(0o755)
            if not target.exists():
                with tempfile.TemporaryDirectory(dir=target.parent) as directory:
                    staged = Path(directory) / 'archive.zip'
                    shutil.copyfile(source, staged)
                    staged.chmod(0o644)
                    staged.replace(target)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    publish_libraries(parser.parse_args().root)
