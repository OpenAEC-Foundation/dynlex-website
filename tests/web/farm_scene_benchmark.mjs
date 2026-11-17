import assert from 'node:assert/strict';
import {recordWebsiteProgram} from './recording_runtime.mjs';
const samples=[[],[]],frames=[[],[]];
let scenario,frame,start,uploaded,draws;
const {allocations}=await recordWebsiteProgram(process.argv[2],{
  allocationLimit:128*1024*1024,
  hooks:{begin_scene_sample:(s,f)=>{scenario=Number(s);frame=Number(f);uploaded=0;draws=0;start=performance.now();},
    end_scene_sample:(records,batches,shadows)=>{
      if(frame>=10) {samples[scenario].push(performance.now()-start);frames[scenario].push({records:Number(records),batches:Number(batches),shadows:Number(shadows),uploaded,draws});}
    }},
  configureRuntime(runtime) {
    runtime.env.ui_shader_uniform=()=>{};
    runtime.env.ui_shader_vertex_buffer=(surface,resource,pass,slot,pointer,count)=>{uploaded+=Number(count);};
    runtime.env.ui_shader_index_buffer=()=>{};
    runtime.env.ui_shader_image=()=>{};
    runtime.env.ui_shader_draws=(surface,resource,pass,pointer,count)=>{draws+=Number(count);};
    runtime.env.ui_shader_frame=()=>100;
  }
});
assert.equal(allocations.live,0,'Scene benchmark retained owned allocations');
console.log(JSON.stringify({scenarios:samples.map((values,index)=>{
  values.sort((a,b)=>a-b);
  return {name:['idle','walking with route'][index],medianMs:values[50],p95Ms:values[95],maxMs:values.at(-1),
    first:frames[index][0],last:frames[index].at(-1),meanUploadedBytes:frames[index].reduce((sum,f)=>sum+f.uploaded,0)/frames[index].length};
}),peakBytes:allocations.peak},null,2));
