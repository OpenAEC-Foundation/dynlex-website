// Test-only GPU timing with real DynLex scene uploads and public host services.
export async function profileFarmGpu(dataUrl,packageRoot) {
  const data=await fetch(dataUrl).then(response=>response.json());
  const original=Object.getOwnPropertyDescriptor(Navigator.prototype,'gpu');
  Object.defineProperty(Navigator.prototype,'gpu',{configurable:true,get:()=>undefined});
  let gpu;
  try {
    const {createGpu}=await import(`${packageRoot}/platform/browser/gpu.js`);
    gpu=await createGpu(error=>{throw error;});
  } finally {
    if(original) Object.defineProperty(Navigator.prototype,'gpu',original);
    else delete Navigator.prototype.gpu;
  }
  if(gpu.backend!=='webgl') throw new Error('The GPU timing fixture requires WebGL2');
  const {createGraphicsServices}=await import(`${packageRoot}/platform/browser/graphics-services.js`);
  const {width,height}=data,canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;document.body.replaceChildren(canvas);
  const surface=gpu.surface(canvas),resources=new Map();
  const largest=Math.max(...data.snapshots.flatMap(snapshot=>snapshot.uploads.map(upload=>upload.data.length)));
  const memory=new WebAssembly.Memory({initial:Math.ceil(largest*4/65536)+1});
  let sequence=100;
  const services=createGraphicsServices({gpu,surfaces:new Map([[1,surface]]),resources,id:()=>sequence++,memory,base:location.href});
  const {resource}=await services.request(data.program,{signal:new AbortController().signal},surface);
  const host=services.imports,words=(values,consume)=>{
    new Uint32Array(memory.buffer,0,values.length).set(values);consume(0,values.length);
  };
  const uniform=input=>words(input.data,pointer=>host.ui_shader_uniform(1,resource,input.pass,0,input.binding,input.scalar,input.rows,input.columns,pointer,input.data.length*4));
  const upload=input=>words(input.data,(pointer,count)=>{
    if(input.operation==='vertex') host.ui_shader_vertex_buffer(1,resource,input.pass,input.slot,pointer,count*4);
    else if(input.operation==='index') host.ui_shader_index_buffer(1,resource,input.pass,pointer,count);
    else host.ui_shader_draws(1,resource,input.pass,pointer,count/7);
  });
  const quad=new Float32Array([0,0,0,0,1,1,1,1,width,0,1,0,1,1,1,1,width,height,1,1,1,1,1,1,
    0,0,0,0,1,1,1,1,width,height,1,1,1,1,1,1,0,height,0,1,1,1,1,1]);
  const frame=()=>{
    const output=host.ui_shader_frame(1,resource,width,height);
    gpu.begin(surface,[0,0,0]);gpu.triangles(surface,quad,resources.get(output),{x:0,y:0,width,height});
    gpu.present(surface,width,height,1);surface.gl.finish();
  };
  const results=[];
  try {
    for(const snapshot of data.snapshots) {
      for(const input of snapshot.uniforms) uniform(input);
      for(const input of snapshot.uploads) upload(input);
      frame();
      for(let pass=0;pass<data.shadowPass;pass++) host.ui_shader_pass_enabled(1,resource,pass,0);
      const values=[];
      for(let index=0;index<35;index++) {
        await new Promise(requestAnimationFrame);
        const start=performance.now();
        host.ui_shader_pass_enabled(1,resource,data.shadowPass,1);
        for(const input of snapshot.uploads) if(input.operation==='draws'||input.slot===2) upload(input);
        frame();
        if(index>=5) values.push(performance.now()-start);
      }
      values.sort((a,b)=>a-b);
      const corner=new Uint8Array(4);surface.gl.readPixels(5,height-5,1,1,surface.gl.RGBA,surface.gl.UNSIGNED_BYTE,corner);
      results.push({scenario:snapshot.scenario,medianMs:values[15],p95Ms:values[28],maximumMs:values.at(-1),corner:[...corner]});
    }
    if(surface.gl.getError()!==surface.gl.NO_ERROR) throw new Error('Farm GPU profile produced a WebGL error');
    return {backend:gpu.backend,width,height,results,png:canvas.toDataURL('image/png')};
  } finally {services.closeSurface(surface);gpu.releaseSurface(surface);gpu.close();}
}
