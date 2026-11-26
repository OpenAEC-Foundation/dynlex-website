"""The public page and editor catalog share package metadata and release URLs."""
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from library_catalog import archive_filename, collect_libraries, dynlex_catalog
from nginx_delivery import locations


class LibraryCatalog(unittest.TestCase):
    def test_only_exported_libraries_enter_both_catalogs(self):
        library = {'package': 'example', 'contentHash': 'a' * 64, 'exports': {'*': 'src/*'},
                   'importName': 'example', 'title': 'A "quoted" library', 'description': 'Draw\nshapes.',
                   'publisher': 'Example', 'documentation': 'https://example.test/docs'}
        packages = {'compiler': SimpleNamespace(manifest={'package': 'compiler'}),
                    'example': SimpleNamespace(manifest=library)}
        entries = collect_libraries({'dependencies': dict.fromkeys(packages)}, packages.__getitem__)
        self.assertEqual(len(entries), 1)
        self.assertEqual(archive_filename(entries[0]), 'example/' + 'a' * 64 + '.zip')
        self.assertEqual(entries[0]['source']['url'], '/libraries/' + archive_filename(entries[0]))
        source = dynlex_catalog(entries)
        for value in ['A "quoted" library', 'Draw\nshapes.', 'https://example.test/docs', entries[0]['source']['url']]:
            self.assertIn(json.dumps(value, ensure_ascii=False), source)
        self.assertEqual(library['description'], 'Draw\nshapes.')

    def test_empty_catalog_has_a_typed_empty_collection(self):
        source = dynlex_catalog([])
        self.assertIn('website library array of 0 items', source)
        self.assertNotIn('the item at', source)

    def test_zip_downloads_have_an_explicit_media_type(self):
        rules = locations()
        archive_rule = rules.split('location ~ \\.(?:zip)$ {')[1].split('\nlocation ')[0]
        self.assertIn('default_type application/zip;', archive_rule)


if __name__ == '__main__':
    unittest.main()
