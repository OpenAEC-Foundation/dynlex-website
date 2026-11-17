// Browser release responses use the compiler's canonical package catalog.
import fs from 'node:fs/promises';
import {compilerPath} from '../../scripts/dependencies.mjs';
const manifest=await fs.readFile(compilerPath('metadata/release-manifest.txt'),'utf8');
const assets=manifest.split('\n').filter(line=>line.startsWith('asset ')).map(line=>({
  name:line.split(/\s+/)[5],browser_download_url:'https://downloads.invalid/'+line.split(/\s+/)[5]
}));
assets.push({name:'release-manifest.txt',browser_download_url:'https://downloads.invalid/release-manifest.txt'});
export const browserRelease={tag_name:'v0.0-browser-test',body:`<!-- dynlex-release-manifest\n${manifest.trimEnd()}\n-->`,assets};
