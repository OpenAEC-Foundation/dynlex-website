// Optional end-to-end timing; inputs still go through the rendered controls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {setTimeout as pause} from 'node:timers/promises';
export async function profileFarmFrames({evaluate,controls,waitFor,command}) {
  await controls.clickText('Start farm ▶');
  await controls.clickText('Whole farm');
  await waitFor('window.siteProbe.farmBounds !== null');
  await pause(500);
  await evaluate('window.siteProbe.farmTimings.length=0;window.siteProbe.sampling=true');
  const profiling=Boolean(process.env.DYNLEX_FARM_CPU_PROFILE);
  if(profiling) {
    await command('Profiler.enable');
    await command('Profiler.setSamplingInterval',{interval:500});
    await command('Profiler.start');
  }
  await pause(4000);
  if(profiling) {
    const {profile}=await command('Profiler.stop');
    await fs.writeFile('.cache/farm-application.cpuprofile',JSON.stringify(profile));
  }
  const samples=await evaluate('window.siteProbe.sampling=false;window.siteProbe.farmTimings.slice()');
  await controls.clickText('Pause farm Ⅱ');
  await controls.clickText('Whole farm');
  await waitFor('window.siteProbe.farmBounds !== null');
  assert(samples.length>2,'The running Farm did not present enough frames to measure');
  const cpu=samples.map(sample=>sample.cpuMs).sort((a,b)=>a-b);
  const gaps=samples.slice(1).map((sample,index)=>sample.timestamp-samples[index].timestamp).sort((a,b)=>a-b);
  const percentile=(values,fraction)=>values[Math.ceil(values.length*fraction)-1];
  const result={profiled:profiling,frames:samples.length,sceneFrames:samples.filter(sample=>sample.rendered).length,fps:1000*(samples.length-1)/(samples.at(-1).timestamp-samples[0].timestamp),
    cpuMedianMs:percentile(cpu,0.5),cpuP95Ms:percentile(cpu,0.95),frameIntervalP95Ms:percentile(gaps,0.95)};
  console.log('Farm application frame timing:',JSON.stringify(result));
}


// A short real-pointer walking profile, independent of role compilation checks.
export async function profileFarmWalk({evaluate,controls,waitFor,command,capture}) {
  await command('Page.bringToFront');
  await controls.clickText('Whole farm');
  await waitFor('window.siteProbe.farmBounds !== null');
  await pause(1000);
  const world=()=>evaluate(`JSON.parse(localStorage.getItem('dynlex.games.guest')).games.farm.data.world`);
  const initial=await world();
  const tile=initial.tiles[19][14];
  const point=await evaluate(`(() => {
    const m=window.siteProbe.farmCamera,box=window.siteProbe.farmViewport;
    const p=[4.5,${tile.height-(tile.type==='water'?0.16:0)},9.5,1];
    const clip=[0,1,2,3].map(row=>p.reduce((sum,value,col)=>sum+m[row*4+col]*value,0));
    return {x:box.x+(clip[0]/clip[3]+1)*box.width/2,y:box.y+(clip[1]/clip[3]+1)*box.height/2};
  })()`);
  const measure=async label=>{
    await evaluate(`(() => {const p=window.siteProbe;p.farmTimings.length=0;p.sampling=true;p.heartbeat=[];p.timers=[];
      const beat=time=>{if(p.sampling){p.heartbeat.push(time);p.nativeFrame(beat);}};p.nativeFrame(beat);
      p.timer=setInterval(()=>p.timers.push(performance.now()),16);})()`);
    if(process.env.DYNLEX_FARM_CPU_PROFILE) {
      await command('Profiler.enable');await command('Profiler.setSamplingInterval',{interval:500});await command('Profiler.start');
    }
    await pause(4000);
    if(process.env.DYNLEX_FARM_CPU_PROFILE) {
      const {profile}=await command('Profiler.stop');await fs.writeFile('.cache/farm-'+label+'.cpuprofile',JSON.stringify(profile));
    }
    const result=await evaluate(`(() => {window.siteProbe.sampling=false;clearInterval(window.siteProbe.timer);return {heartbeat:window.siteProbe.heartbeat,timers:window.siteProbe.timers,samples:window.siteProbe.farmTimings.slice(),
      hidden:document.hidden,focus:document.hasFocus(),viewport:window.siteProbe.farmViewport,frame:window.siteProbe.farmFrames.at(-1)};})()`);
    const samples=result.samples,cpu=samples.map(s=>s.cpuMs).sort((a,b)=>a-b);
    const median=values=>values[Math.floor(values.length/2)];
    const summary={label,heartbeatFrames:result.heartbeat.length,timerTicks:result.timers.length,queueMedian:median(samples.map(s=>s.queuedMs).sort((a,b)=>a-b)),hidden:result.hidden,focus:result.focus,viewport:result.viewport,frame:result.frame,
      frames:samples.length,sceneFrames:samples.filter(s=>s.rendered).length,cpuMedian:median(cpu),cpuMax:cpu.at(-1),gpuWaitMedian:median(samples.map(s=>s.gpuWaitMs).sort((a,b)=>a-b)),drawsMedian:median(samples.map(s=>s.glDraws).sort((a,b)=>a-b)),
      fps:1000*(samples.length-1)/(samples.at(-1).timestamp-samples[0].timestamp)};
    await fs.writeFile('.cache/farm-'+label+'-timing.json',JSON.stringify(result,null,2));
    console.log('Farm real input timing:',JSON.stringify(summary));
    assert(samples.length>2,'The visible Farm did not schedule frames');
  };
  await measure('idle');
  await controls.click(point.x,point.y);
  await waitFor(`(() => {const p=JSON.parse(localStorage.getItem('dynlex.games.guest')).games.farm.data.world.player;return p.target!==null;})()`);
  const started=await world();
  assert.deepEqual([started.player.target.x,started.player.target.y],[14,19]);
  await measure('walking');
  const after=await world();
  assert.notDeepEqual([after.player.x,after.player.y],[initial.player.x,initial.player.y],'The pointer route did not move the farmer');
  console.log('Farmer route advanced:',JSON.stringify({from:[initial.player.x,initial.player.y],to:[after.player.x,after.player.y],target:after.player.target}));
  await capture('farm-walking-profile');
}
