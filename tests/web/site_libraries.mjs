import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {recordWebsiteProgram} from './recording_runtime.mjs';
const {output,requests}=await recordWebsiteProgram(process.argv[2]);
assert.equal(output,'The library directory filters cards, clears search and opens the pinned SDK archive.\n');
const project=JSON.parse(await fs.readFile(new URL('../../site/project.json',import.meta.url),'utf8'));
assert.deepEqual(requests,[{service:'open',payload:{url:'/libraries/dynlex-ui/'+project.dependencies['dynlex-ui'].contentHash+'.zip',newTab:false}}]);
console.log('Library search and immutable SDK download controller passed.');
