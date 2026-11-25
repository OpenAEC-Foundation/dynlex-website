import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {compilerPath} from '../../scripts/dependencies.mjs';
const {command,evaluate,navigate,closeBrowserSession,runtimeExceptions} =
  await import(pathToFileURL(compilerPath('tests/web/browser_test_driver.mjs')));
try {
  await command('Page.enable'); await command('Runtime.enable');
  await navigate('/');
  const result=await evaluate(`import('/__tests__/workers.mjs').then(module=>module.verifyWorkers(new URL('/',location.href)))`);
  assert.equal(result.output,'42\n'); assert.equal(result.cancelled,true);
  assert.deepEqual(runtimeExceptions,[]);
  console.log('Compiler workers: execution, language service, shaders, debug stepping, call frames, breakpoints, Pause and Stop passed.');
} finally {closeBrowserSession();}
