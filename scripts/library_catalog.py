"""Describe the pinned libraries for both the editor catalog and public page."""
import json


def collect_libraries(project, package_lookup):
    entries = []
    for name in project['dependencies']:
        manifest = package_lookup(name).manifest
        if 'exports' not in manifest:
            continue
        entries.append({'name': name, 'alias': manifest['importName'], 'title': manifest['title'],
                        'description': manifest['description'], 'publisher': manifest['publisher'],
                        'documentation': manifest['documentation'],
                        'source': {'url': f"/libraries/{name}/{manifest['contentHash']}.zip",
                                   'contentHash': manifest['contentHash']}})
    return entries


def archive_filename(entry):
    return entry['name'] + '/' + entry['source']['contentHash'] + '.zip'


def dynlex_catalog(entries):
    records = []
    for entry in entries:
        values = [entry['name'], entry['title'], entry['publisher'], entry['description'],
                  'Import as ' + entry['alias'], entry['documentation'],
                  entry['title'] + ' documentation ↗', entry['source']['url'],
                  'Download ' + entry['title'] + ' ↓', 'action:library-download:' + entry['name'],
                  ' '.join(entry[key] for key in ['name', 'title', 'publisher', 'description', 'alias'])]
        records.append('@intrinsic("construct", website library, ' +
                       ', '.join(json.dumps(value, ensure_ascii=False) for value in values) + ')')
    names = [f'library catalog entry {index}' for index in range(len(records))]
    constants = '\n'.join(name + ' means: ' + record for name, record in zip(names, records, strict=True))
    collection = '[' + ', '.join(names) + ']' if records else '@intrinsic("construct", website library array of 0 items)'
    cards = ',\n    '.join(f'website library card ({name})' for name in names)
    children = '[' + cards + ']' if cards else 'no UI children'
    return ('# Generated from the same pinned packages as libraries/index.json.\n'
            'import declarations.dl\n\n' + constants + '\n\n'
            'the website libraries means: ' + collection + '\n\n'
            'the website library cards means: (a UI container of kind 41 containing ' + children +
            ' named "Library results") wearing library catalog appearance\n')


def main():
    from dependencies import ROOT, dependency
    project = json.loads((ROOT / 'site/project.json').read_text())
    entries = collect_libraries(project, dependency)
    print(dynlex_catalog(entries), end='')


if __name__ == '__main__':
    main()
