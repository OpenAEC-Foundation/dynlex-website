"""Pinned SDK archives survive site-release cleanup and preserve their URLs."""
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from publish_libraries import publish_libraries


class PublishLibraries(unittest.TestCase):
    def test_migrates_all_releases_and_keeps_existing_archives_immutable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for release, digest in [('old', 'a'), ('new', 'b')]:
                source = root / 'releases' / release / 'libraries/example' / (digest * 64 + '.zip')
                source.parent.mkdir(parents=True)
                source.write_bytes(release.encode())
            (root / 'releases/before-libraries').mkdir()
            mask = os.umask(0o077)
            try:
                publish_libraries(root)
            finally:
                os.umask(mask)
            pool = root / 'libraries/example'
            self.assertEqual((pool / ('a' * 64 + '.zip')).read_bytes(), b'old')
            self.assertEqual((pool / ('b' * 64 + '.zip')).read_bytes(), b'new')
            self.assertEqual(pool.stat().st_mode & 0o777, 0o755)
            self.assertEqual((pool / ('a' * 64 + '.zip')).stat().st_mode & 0o777, 0o644)
            (root / 'releases/new/libraries/example' / ('a' * 64 + '.zip')).write_bytes(b'equivalent archive with newer export metadata')
            publish_libraries(root)
            shutil.rmtree(root / 'releases')
            self.assertEqual((pool / ('a' * 64 + '.zip')).read_bytes(), b'old')
            self.assertEqual((pool / ('b' * 64 + '.zip')).read_bytes(), b'new')


if __name__ == '__main__':
    unittest.main()
