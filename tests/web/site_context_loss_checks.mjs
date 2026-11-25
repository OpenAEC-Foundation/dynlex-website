import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';

export async function verifyContextLoss({evaluate,waitFor,capture,graphicsMode}) {
  if(!graphicsMode.startsWith('webgl-')) return;
  const before=await evaluate('({route:location.pathname+location.search,title:document.title,instances:window.siteProbe.applicationInstances})');
  await evaluate(`window.contextLossProbe={canvas:document.querySelector('canvas'),event:null};
    contextLossProbe.extension=contextLossProbe.canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    contextLossProbe.canvas.addEventListener('webglcontextlost',event=>{contextLossProbe.event=event;},{once:true});
    contextLossProbe.extension.loseContext();`);
  await waitFor('window.contextLossProbe.event!==null');
  assert(await evaluate('contextLossProbe.event.defaultPrevented'),'The website did not enable WebGL restoration');
  assert(await evaluate('document.querySelector("canvas")===contextLossProbe.canvas'),'Context loss removed the website');
  const paints=await evaluate('window.siteProbe.paints');
  await pause(100);
  assert.equal(await evaluate('window.siteProbe.paints'),paints,'The suspended website kept submitting GPU work');
  await evaluate('contextLossProbe.extension.restoreContext()');
  await waitFor(`window.siteProbe.paints>${paints}`);
  assert(await evaluate('document.querySelector("canvas")===contextLossProbe.canvas'),'Restoration replaced the application canvas');
  assert.deepEqual(await evaluate('({route:location.pathname+location.search,title:document.title,instances:window.siteProbe.applicationInstances})'),before,
    'Restoration restarted the application or changed its navigation state');
  await capture('context-restored');
}
