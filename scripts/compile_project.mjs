// Add the application's language vocabulary to the selected source snapshot,
// then delegate compilation to the pinned compiler distribution.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {root,compilerPath} from './dependencies.mjs';
const [file,output] = process.argv.slice(2);
if (!file || !output) throw new Error('Usage: node scripts/compile_project.mjs request.json output');
const request = JSON.parse(await fs.readFile(file,'utf8'));
for (const name of await fs.readdir(path.join(root,'site/language'))) {
  if (name.endsWith('.dl')) request.sources['site/language/'+name] = await fs.readFile(path.join(root,'site/language',name),'utf8');
}
const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'dynlex-site-request-'));
try {
  const snapshot = path.join(temporary,'request.json');
  await fs.writeFile(snapshot,JSON.stringify(request));
  execFileSync(process.execPath,[compilerPath('scripts/compile_project.mjs'),snapshot,output],{stdio:'inherit'});
} finally { await fs.rm(temporary,{recursive:true,force:true}); }
