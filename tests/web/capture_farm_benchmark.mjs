// Capture two production scene states for GPU profiling without the whole site.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {recordWebsiteProgram} from './recording_runtime.mjs';
const [binary,programFile,output]=process.argv.slice(2);
const buffers=new Map(),uniforms=new Map(),snapshots=[];
let scenario=-1,frame=-1;
await recordWebsiteProgram(binary,{
  allocationLimit:128*1024*1024,
  hooks:{begin_scene_sample:(s,f)=>{scenario=Number(s);frame=Number(f);},end_scene_sample:()=>{
    if(frame===10) snapshots.push({scenario,uploads:[...buffers.values()],uniforms:[...uniforms.values()]});
  }},
  configureRuntime(runtime) {
    const words=(pointer,count)=>Array.from(new Uint32Array(runtime.env.__linear_memory.buffer,Number(pointer),Number(count)));
    runtime.env.ui_shader_uniform=(surface,resource,pass,group,binding,scalar,rows,columns,pointer,count)=>
      uniforms.set(`${pass}:${binding}`,{pass:Number(pass),binding:Number(binding),scalar:Number(scalar),rows:Number(rows),columns:Number(columns),data:words(pointer,Number(count)/4)});
    runtime.env.ui_shader_vertex_buffer=(surface,resource,pass,slot,pointer,count)=>{
      if(Number(slot)<2||frame===10||scenario<0) buffers.set(`${pass}:vertex:${slot}`,{operation:'vertex',pass:Number(pass),slot:Number(slot),data:words(pointer,Number(count)/4)});
    };
    runtime.env.ui_shader_index_buffer=(surface,resource,pass,pointer,count)=>buffers.set(`${pass}:index`,{operation:'index',pass:Number(pass),data:words(pointer,count)});
    runtime.env.ui_shader_draws=(surface,resource,pass,pointer,count)=>buffers.set(`${pass}:draws`,{operation:'draws',pass:Number(pass),data:words(pointer,Number(count)*7)});
    runtime.env.ui_shader_frame=()=>100;
  }
});
const program=JSON.parse(await fs.readFile(programFile,'utf8'));
await fs.mkdir(path.dirname(output),{recursive:true});
const shadowPass=program.passes.findIndex(pass=>pass.depth?.view?.image==='shadow');
const surfacePass=program.passes.findIndex(pass=>pass.color?.view?.image==='scene_multisample');
assert(shadowPass>=0&&surfacePass>shadowPass);
await fs.writeFile(output,JSON.stringify({width:960,height:640,shadowPass,surfacePass,program,snapshots}));
console.log(`Captured ${snapshots.length} Farm states: ${output}`);
