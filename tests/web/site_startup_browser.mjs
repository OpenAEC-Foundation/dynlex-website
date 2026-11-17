// Cold navigation measurements use the same rendered controls as other UI tests.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const server=spawn('python3',['scripts/serve_web.py','0','--deployment','--directory',process.env.DYNLEX_TEST_WEB_ROOT],{stdio:['ignore','pipe','ignore']});
process.env.DYNLEX_SITE_ORIGIN=await new Promise((resolve,reject)=>{
  let output='';server.stdout.on('data',data=>{output+=data;const match=output.match(/Serving DynLex at (http:\/\/[^\s]+)/);if(match)resolve(match[1]);});
  server.once('exit',code=>reject(new Error('Startup server exited: '+code)));
});
const {command,navigate,evaluate,waitFor,onProtocolEvent,closeBrowserSession,runtimeExceptions,consoleErrors}=await import('./browser_test_driver.mjs');
const files=new Map();
onProtocolEvent('Network.requestWillBeSent',({requestId,request,timestamp})=>files.set(requestId,{url:request.url,start:timestamp}));
onProtocolEvent('Network.loadingFinished',({requestId,timestamp,encodedDataLength})=>{
  const file=files.get(requestId);if(file)Object.assign(file,{end:timestamp,bytes:encodedDataLength});
});
try {
  await command('Network.setCacheDisabled',{cacheDisabled:true});
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await command('Emulation.setCPUThrottlingRate',{rate:Number(process.env.DYNLEX_STARTUP_CPU||4)});
  if(process.env.DYNLEX_STARTUP_NETWORK) await command('Network.emulateNetworkConditions',{
    offline:false,latency:40,downloadThroughput:9_000_000/8,uploadThroughput:2_000_000/8,connectionType:'cellular4g'});
  const stored=process.env.DYNLEX_STARTUP_SAVED?JSON.parse(await fs.readFile(new URL('./fixtures/progress-model.json',import.meta.url),'utf8')).expected.find(value=>value.games?.farm):null;
  await command('Page.addScriptToEvaluateOnNewDocument',{source:await fs.readFile(new URL('./fixtures/ui-color-probe.js',import.meta.url),'utf8')});
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`
    if (${JSON.stringify(Boolean(process.env.DYNLEX_STARTUP_SAVED))}) localStorage.setItem('dynlex.games.guest',${JSON.stringify(JSON.stringify(stored))});
    window.startupProbe={phases:[{name:'probe',time:performance.now()}],texts:[]};
    const instantiate=WebAssembly.instantiate.bind(WebAssembly);
    WebAssembly.instantiate=(bytes,imports,...args)=>{
      const env=imports?.env;
      if(env?.ui_open){
        for(const name of ['ui_open','ui_launch','ui_present']) {
          const original=env[name];let recorded=false;
          env[name]=(...args)=>{const result=original(...args);if(!recorded){recorded=true;startupProbe.phases.push({name,time:performance.now()});}return result;};
        }
        const mask=env.ui_text_mask,decoder=new TextDecoder();
        env.ui_text_mask=(font,pointer,count,...args)=>{
          const result=mask(font,pointer,count,...args);
          if(result)startupProbe.texts.push(decoder.decode(new Uint8Array(env.__linear_memory.buffer,pointer,count)));
          return result;
        };
      }
      return instantiate(bytes,imports,...args);
    };
    Object.defineProperty(Navigator.prototype,'gpu',{configurable:true,get:()=>undefined});
    new PerformanceObserver(list=>{for(const entry of list.getEntries()) startupProbe.phases.push({name:'longtask',time:entry.startTime,duration:entry.duration});}).observe({type:'longtask',buffered:true});
  `});
  if(process.env.DYNLEX_STARTUP_CPU_PROFILE) {await command('Profiler.enable');await command('Profiler.setSamplingInterval',{interval:500});await command('Profiler.start');}
  await navigate('/');
  await waitFor('window.startupProbe?.phases.some(p=>p.name==="ui_present")','first usable UI frame',90000);
  if(process.env.DYNLEX_STARTUP_CPU_PROFILE) {const {profile}=await command('Profiler.stop');await fs.writeFile('.cache/startup-main.cpuprofile',JSON.stringify(profile));}
  const firstFrame=await evaluate('startupProbe.phases.find(p=>p.name==="ui_present").time');
  const docs=await evaluate('window.colorProbe.find(p=>p.text==="Docs")');
  assert(docs,'The first frame must expose usable navigation');
  const clickedAt=await evaluate('performance.now()');
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:docs.x,y:docs.y});
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x:docs.x,y:docs.y,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:docs.x,y:docs.y,button:'left',clickCount:1});
  await waitFor('location.pathname==="/wiki/index.html" && document.title==="DynLex Wiki"','navigation while background assets are pending');
  const interactionMs=await evaluate('performance.now()')-clickedAt;
  await new Promise(resolve=>setTimeout(resolve,Number(process.env.DYNLEX_STARTUP_OBSERVE_MS||10000)));
  const result=await evaluate(`({phases:startupProbe.phases,navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),resources:performance.getEntriesByType('resource').map(e=>({url:e.name,start:e.startTime,end:e.responseEnd,bytes:e.encodedBodySize})),ready:document.readyState})`);
  result.network=[...files.values()];result.interactionMs=interactionMs;
  const output=process.env.DYNLEX_STARTUP_OUTPUT||'.cache/startup-baseline.json';
  await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({firstFrame:result.phases.find(p=>p.name==='ui_present'),phases:result.phases.filter(p=>p.name!=='longtask'),longTasks:result.phases.filter(p=>p.name==='longtask').sort((a,b)=>b.duration-a.duration).slice(0,8),interactionMs,bytes:result.resources.reduce((sum,r)=>sum+r.bytes,0),requests:result.resources.length,output}));
  assert(!result.network.some(file=>new URL(file.url).pathname.endsWith('/dynlex_web.wasm')),
    'Navigation downloaded the optional compiler before an editor needed it');
  if(process.env.DYNLEX_STARTUP_BUDGET_MS) assert(firstFrame<=Number(process.env.DYNLEX_STARTUP_BUDGET_MS),`First usable frame took ${firstFrame} ms`);
  assert.deepEqual(runtimeExceptions,[]);assert.deepEqual(consoleErrors,[]);
} finally {closeBrowserSession();server.kill('SIGTERM');}
