// Check the actual compiler boundary consumed by the DynLex program controller.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import {compilerPath} from '../../scripts/dependencies.mjs';
const factory=(await import(pathToFileURL(compilerPath('src/web/ide/public/compiler/dynlex_web.js')).href)).default;
const directory=compilerPath('src/web/ide/public/compiler');
const compiler=await factory({locateFile:name=>path.join(directory,name)});
compiler.ccall('dynlex_web_init');
assert.equal(compiler.ccall('dynlex_web_set_import_sources','number',['string'],[JSON.stringify({
  'site/language/river_challenge.dl':await fs.readFile(new URL('../../site/language/river_challenge.dl',import.meta.url),'utf8'),
  'river.dl':'import site/language/river_challenge.dl\n\nthis is invalid river code'
})]),0);
assert.equal(compiler.ccall('dynlex_web_set_entry_file','number',['string'],['river.dl']),0);
assert.equal(compiler.ccall('dynlex_web_compile_and_emit_wasm_traced','number'),1);
const {diagnostics}=JSON.parse(compiler.ccall('dynlex_web_get_diagnostics_json','string'));
assert.equal(diagnostics.length,1);
assert.equal(diagnostics[0].file,'/workspace/river.dl');
assert.equal(diagnostics[0].line,3);
console.log('Browser compilation reports virtual workspace paths and includes the two hidden River prefix lines.');
