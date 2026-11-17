import assert from 'node:assert/strict';
import {recordWebsiteProgram} from './recording_runtime.mjs';
const result=await recordWebsiteProgram(process.argv[2],{allocationLimit:32*1024*1024});
assert.equal(result.requests.length,2);
assert.equal(result.requests[0].service,'graphics');
assert.equal(result.allocations.live,0);
console.log('Shader preparation deduplicates active work and leaves other scenes unloaded.');
