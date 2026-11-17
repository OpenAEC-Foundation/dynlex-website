// Optional end-to-end timing; inputs still go through the rendered controls.
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
export async function profileFarmFrames({evaluate,controls}) {
  await controls.clickText('Start farm ▶');
  await pause(500);
  await evaluate('window.siteProbe.farmTimings.length=0');
  await pause(4000);
  const samples=await evaluate('window.siteProbe.farmTimings.slice()');
  await controls.clickText('Pause farm Ⅱ');
  assert(samples.length>2,'The running Farm did not present enough frames to measure');
  const cpu=samples.map(sample=>sample.cpuMs).sort((a,b)=>a-b);
  const gaps=samples.slice(1).map((sample,index)=>sample.timestamp-samples[index].timestamp).sort((a,b)=>a-b);
  const percentile=(values,fraction)=>values[Math.ceil(values.length*fraction)-1];
  const result={frames:samples.length,fps:1000*(samples.length-1)/(samples.at(-1).timestamp-samples[0].timestamp),
    cpuMedianMs:percentile(cpu,0.5),cpuP95Ms:percentile(cpu,0.95),frameIntervalP95Ms:percentile(gaps,0.95)};
  console.log('Farm application frame timing:',JSON.stringify(result));
}
