import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(fs.readFileSync(path.join(root,'site/project.json'),'utf8')).dependencies;
export const compilerRoot = path.join(root,'.cache/packages/dynlex-web',lock['dynlex-web'].contentHash);
export const compilerPath = relative => path.join(compilerRoot,relative);
if (!fs.existsSync(compilerPath('sdk.json')) && !fs.existsSync(compilerPath('package.json')))
  throw new Error('Resolve pinned dependencies first: python3 scripts/dependencies.py');
