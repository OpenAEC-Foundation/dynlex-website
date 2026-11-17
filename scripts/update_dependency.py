#!/usr/bin/env python3
"""Validate and pin an exported DynLex package."""
import argparse,json,shutil
from pathlib import Path
from source_package import SourcePackage
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('archive',type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
package=SourcePackage(args.archive)
project=root/'site/project.json'
lock=json.loads(project.read_text())
name=package.manifest['package']
entry=lock['dependencies'][name]
shutil.copyfile(args.archive,root/'site'/entry['archive'])
entry['contentHash']=package.manifest['contentHash']
project.write_text(json.dumps(lock,indent=2)+'\n')
print(f"Pinned {name}: {entry['contentHash']}")
