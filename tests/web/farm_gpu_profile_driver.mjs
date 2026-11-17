// Run with the isolated browser harness; save images without printing base64.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {navigate,evaluate,closeBrowserSession,runtimeExceptions} from './browser_test_driver.mjs';
const output=process.env.DYNLEX_PROFILE_OUTPUT;
assert(output,'DYNLEX_PROFILE_OUTPUT must select the benchmark result directory');
await fs.mkdir(output,{recursive:true});
try {
  await navigate('/');
  const profiles=await evaluate("fetch('/profiles.json').then(response=>response.json())");
  for(const {name,data,packageRoot} of profiles) {
    assert(/^[a-z0-9_-]+$/.test(name),'Profile names must be simple file names');
    const result=await evaluate(`import('/farm_gpu_profile.mjs').then(module=>module.profileFarmGpu(${JSON.stringify(data)},${JSON.stringify(packageRoot)}))`);
    await fs.writeFile(path.join(output,`farm-${name}.png`),Buffer.from(result.png.split(',')[1],'base64'));
    delete result.png;
    await fs.writeFile(path.join(output,`gpu-${name}.json`),JSON.stringify(result,null,2)+'\n');
    console.log(name,JSON.stringify(result));
  }
  assert.deepEqual(runtimeExceptions,[],'The GPU benchmark raised a browser exception');
} finally {await closeBrowserSession();}
