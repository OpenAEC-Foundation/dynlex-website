import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';

export async function verifySourceLineCommit({controls,command,evaluate,waitFor,capture,origin}) {
  const source='import lib/std.dl\n\nset x to 1\nprint line the string form of x\n';
  await command('Page.navigate',{url:origin+'/ide/?'+new URLSearchParams({name:'commit.dl',code:source})});
  const messages='window.siteProbe.languageMessages';
  const changes=messages+'.filter(message=>message.method==="textDocument/didChange")';
  await waitFor('window.siteProbe.diagnostics.some(report=>report.uri.endsWith("/commit.dl") && report.diagnostics.length===0)');
  await controls.clickText('import lib/std.dl');
  await controls.key('Home','Home',36,2);
  await controls.key('ArrowDown','ArrowDown',40);
  await controls.key('ArrowDown','ArrowDown',40);
  await controls.key('End','End',35);
  await waitFor(messages+'.some(message=>message.method==="dynlex/activeCursorChanged" && message.params.position?.line===2)');
  const following='window.colorProbe.filter(item=>item.text.includes("print")).map(item=>({text:item.text,ink:item.ink}))';
  await waitFor(following+'.length>0');
  const colors=await evaluate(following);
  const reports=await evaluate('window.siteProbe.diagnostics.length');
  const replies=await evaluate('window.siteProbe.languageReplies.length');
  await command('Input.insertText',{text:' +'});
  await waitFor(changes+'.some(message=>message.params.contentChanges.some(change=>change.text===" +"))');
  assert.deepEqual(await evaluate(following),colors,'Typing temporarily hid colors outside the edited range');
  await waitFor(`window.siteProbe.languageReplies.slice(${replies}).some(reply=>reply.request.method==='textDocument/semanticTokens/full')`);
  await waitFor(`JSON.stringify(${following})===${JSON.stringify(JSON.stringify(colors))}`);
  assert.equal(await evaluate('window.siteProbe.diagnostics.length'),reports,
    'Typing on the active line recompiled the project');
  assert.deepEqual(await evaluate(following),colors,'An unfinished line invalidated the following line colors');
  assert(await evaluate(changes+'.every(message=>message.params.contentChanges.every(change=>change.range))'),
    'Studio sent a full-document replacement');
  await capture('uncommitted-source-line');
  await controls.key('ArrowDown','ArrowDown',40);
  await waitFor(`window.siteProbe.diagnostics.slice(${reports}).some(report=>report.diagnostics.length>0)`);
  await capture('committed-source-error');
  await controls.key('ArrowUp','ArrowUp',38);
  await controls.key('End','End',35);
  await controls.key('Backspace','Backspace',8);
  await controls.key('Backspace','Backspace',8);
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(source)}`);
  await pause(500);
  assert(await evaluate('window.siteProbe.diagnostics.at(-1).diagnostics.length>0'),
    'An uncommitted repair replaced the diagnostic snapshot');
  await controls.key('ArrowDown','ArrowDown',40);
  await waitFor('window.siteProbe.diagnostics.at(-1).diagnostics.length===0');
  await controls.key('ArrowUp','ArrowUp',38);
  await controls.key('End','End',35);
  const count=await evaluate(changes+'.length');
  const before=await evaluate('window.siteProbe.diagnostics.length');
  await command('Input.insertText',{text:' '});
  await waitFor(changes+`.length>${count}`);
  await pause(400);
  assert.equal(await evaluate('window.siteProbe.diagnostics.length'),before,
    JSON.stringify(await evaluate('window.siteProbe.languageReplies.slice(-10)')));
  await controls.clickText('File');
  await waitFor('window.siteProbe.diagnostics.length>'+before);
  await capture('source-line-committed-on-blur');
  console.log('Active-line drafts retain diagnostics and semantic colors; leaving the line or editor commits once.');
}
