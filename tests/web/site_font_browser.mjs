import assert from 'node:assert/strict';
import {navigate,evaluate,waitFor,closeBrowserSession,consoleErrors,runtimeExceptions} from './browser_test_driver.mjs';
try {
  await navigate('/');
  await waitFor('document.querySelector("canvas[aria-label]")','application fonts loaded');
  const metrics=await evaluate(`(async()=>{
    const {loadFonts,createFontServices}=await import('/packages/dynlex-ui/platform/browser/fonts.js');
    const manifest=await (await fetch('/application.json')).json();
    const faces=await loadFonts(manifest.fonts,new URL('/',location.href));
    const samples=['DynLex — Code becomes light.','AV fi ffi office 0123456789','Àéñß ÆŒ ø Đ ẞ','Ελληνικά Кириллица','→ ↗ ↓ ■ ▶'];
    const context=new OffscreenCanvas(1,1).getContext('2d');context.fontKerning='none';
    let id=0;const resources=new Map(),coverage=new Map();
    const fonts=createFontServices({mask(surface,bytes,width,height){const texture={};coverage.set(texture,bytes.reduce((a,b)=>a+b,0));return {texture};},retire(){}},faces,resources,()=>++id);
    const result=[];
    for(const weight of [400,600]) {
      const face=new FontFace('Native'+weight,'url("/assets/fonts/Inter-'+weight+'.ttf")',{weight:String(weight)});
      await face.load();document.fonts.add(face);
      for(const size of [13,17,32]) {
        const handle=fonts.open(null,'assets/fonts/Inter-'+weight+'.ttf',size);
        context.font=weight+' '+size+'px "Native'+weight+'"';
        for(const text of samples) result.push({weight,size,text,native:context.measureText(text).width,delivered:fonts.width(handle,text)});
        const mask=fonts.mask(handle,'Illumination',1,-100,-100,1000,1000);
        result.push({weight,size,coverage:coverage.get(resources.get(mask).texture)});
        fonts.close(handle);
      }
      document.fonts.delete(face);
    }
    for(const {face} of faces.values())document.fonts.delete(face);
    return result;
  })()`);
  for(const item of metrics.filter(item=>item.text))
    assert(Math.abs(item.native-item.delivered)<0.0001,JSON.stringify(item));
  for(const size of [13,17,32])
    assert(metrics.find(item=>item.size===size&&item.weight===600&&item.coverage).coverage>
      metrics.find(item=>item.size===size&&item.weight===400&&item.coverage).coverage,'Semibold was rasterized at regular weight');
  assert.deepEqual(consoleErrors,[]);assert.deepEqual(runtimeExceptions,[]);
  console.log('Variable font delivery preserves native advances across scripts and sizes and rasterizes distinct regular/semibold weights.');
} finally {closeBrowserSession();}
