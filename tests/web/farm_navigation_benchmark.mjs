import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildRuntimeImports,createRuntimeFilesystem,inspectRuntimeWasmLayout} from './compiler_runtime.mjs';
import {observeAllocations} from './allocation_probe.mjs';
const bytes=await fs.readFile(process.argv[2]);
const runtime=buildRuntimeImports([],createRuntimeFilesystem(),inspectRuntimeWasmLayout(bytes));
const allocations=observeAllocations(runtime,64*1024*1024);
const samples=Array.from({length:4},()=>[]),answers=[];
let begin,round,scenario;
runtime.env.begin_route_sample=(r,s)=>{round=Number(r);scenario=Number(s);begin=performance.now();};
runtime.env.end_route_sample=(reachable,count)=>{
  const elapsed=performance.now()-begin,answer={reachable:Boolean(reachable),steps:Number(count)};
  if(round===0) answers[scenario]=answer;
  else {assert.deepEqual(answer,answers[scenario]);samples[scenario].push(elapsed);}
};
const {instance}=await WebAssembly.instantiate(bytes,runtime);
assert.equal(instance.exports.main(),0);
assert.equal(allocations.live,0,'Navigation benchmark retained owned allocations');
const report={scenarios:samples.map((values,index)=>{
  values.sort((a,b)=>a-b);
  return {...answers[index],samples:values.length,medianMs:values[50],p95Ms:values[95],maxMs:values.at(-1)};
}),peakBytes:allocations.peak};
console.log(JSON.stringify(report,null,2));
