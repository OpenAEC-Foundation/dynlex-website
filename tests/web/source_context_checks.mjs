import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {openSourceContext,studioToolbar} from './studio_controls.mjs';

export async function verifyContextualEditorActions({controls,command,evaluate,waitFor,capture,origin}) {
  const program=await fs.readFile(new URL('./fixtures/editor_quickfix.dl',import.meta.url),'utf8');
  const fixed=program.replace('    return value\n','    return @intrinsic("cast", value, @intrinsic("type", "int", 32))\n');
  const query=new URLSearchParams({name:'context.dl',code:program});
  await command('Page.navigate',{url:origin+'/ide/?'+query});
  await waitFor('window.colorProbe?.some(item=>item.text.trim()==="context.dl")');
  await controls.clickText('import lib/std.dl');
  await controls.key('Home','Home',36,2);
  for(let row=0;row<5;row++) await controls.key('ArrowDown','ArrowDown',40);
  await controls.key('Home','Home',36);
  for(let column=0;column<11;column++) await controls.key('ArrowRight','ArrowRight',39);
  const bulbs='window.iconProbe.filter(item=>item.y>200 && item.y<500 && item.x<900)';
  await waitFor(bulbs+'.length===1');
  assert(!await evaluate('window.colorProbe.some(item=>item.text.trim()==="Convert returned value to a 32-bit integer")'),
    'Availability must not steal keyboard focus by opening the fixes list');
  const bulb=(await evaluate(bulbs))[0];
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:bulb.x,y:bulb.y});
  await waitFor('window.colorProbe.some(item=>item.text.trim()==="Quick fixes (Ctrl+.)")');
  await capture('contextual-lightbulb');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x:bulb.x,y:bulb.y,button:'left',buttons:1,clickCount:1});
  await waitFor(bulbs+'.length===1');
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:bulb.x,y:bulb.y,button:'left',buttons:0,clickCount:1});
  await waitFor('window.colorProbe.some(item=>item.text.trim()==="Convert returned value to a 32-bit integer")');
  await capture('contextual-quick-fixes');
  await controls.key('Enter','Enter',13);
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(fixed)}`);
  await waitFor(bulbs+'.length===0');
  await controls.key('KeyZ','z',90,2);
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(program)}`);
  await waitFor(bulbs+'.length===1');
  await controls.key('Period','.',190,2);
  await waitFor('window.colorProbe.some(item=>item.text.trim()==="Convert returned value to a 32-bit integer")');
  await controls.key('Escape','Escape',27);
  await controls.key('Home','Home',36,2);
  await waitFor(bulbs+'.length===0');
  await openSourceContext({controls,command,waitFor},'lib/std.dl');
  await capture('source-context-menu');
  await controls.clickText('Go to definition (F12)');
  await waitFor('window.colorProbe.some(item=>item.text.trim()==="std.dl · Read only")');
  await waitFor(bulbs+'.length===0');
  await controls.key('F10','F10',121,8);
  await waitFor('window.colorProbe.some(item=>item.text.trim()==="Go to definition (F12)")');
  await controls.key('Escape','Escape',27);
  await controls.key('ArrowLeft','ArrowLeft',37,1);
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(program)}`);
  console.log('Quick fixes appear only when available, apply and undo through the lightbulb; right-click opens definitions for the clicked token, including read-only library sources.');
}

export async function verifyDebugLibrarySource({controls,command,waitFor,capture,evaluate,origin}) {
  const code='import lib/std.dl\nimport packages/dynlex-ui/ui/geometry.dl\nignore (the UI intersection of (UI box at 0 0 sized 10 10) and (UI box at 2 2 sized 10 10))\n';
  await command('Page.navigate',{url:origin+'/ide/?'+new URLSearchParams({name:'library-debug.dl',code})});
  await waitFor('window.colorProbe?.some(item=>item.text.trim()==="library-debug.dl")');
  await studioToolbar({controls,evaluate},'Debug');
  await waitFor('window.siteProbe.debugEvents.some(event=>event.type==="program-paused")');
  await controls.key('F11','F11',122);
  await waitFor('window.siteProbe.debugEvents.filter(event=>event.type==="program-paused").at(-1)?.frames[0].uri.includes("/packages/dynlex-ui/ui/geometry.dl")');
  await waitFor('document.querySelector("textarea")?.readOnly && window.colorProbe.some(item=>item.text.trim()==="geometry.dl · Read only")');
  await capture('debugger-sdk-source');
  await controls.key('F5','F5',116,8);
  await waitFor('window.siteProbe.visible.includes("Stopped.")');
  await command('Page.reload');
  await waitFor('window.colorProbe?.some(item=>item.text.trim()==="library-debug.dl")');
  await evaluate('window.siteProbe.holdSourceReply=true');
  await studioToolbar({controls,evaluate},'Debug');
  await waitFor('window.siteProbe.debugEvents.some(event=>event.type==="program-paused")');
  await controls.key('F11','F11',122);
  await waitFor('window.siteProbe.delayedSources===1');
  await controls.key('F5','F5',116,8);
  await waitFor('window.siteProbe.visible.includes("Stopped.")');
  await new Promise(resolve=>setTimeout(resolve,650));
  assert.equal(await evaluate('document.querySelector("textarea").value'),code);
  assert.equal(await evaluate('document.querySelector("textarea").readOnly'),false);
  await capture('debugger-source-cancelled');
  const files={
    'main.dl':'import lib/std.dl\nimport first.dl\nprint line (outer result for 1)\n',
    'first.dl':'import tools/second.dl\nto get outer result for {value}:\n    return inner result for value\n',
    'tools/second.dl':'to get inner result for {value}:\n    return value + 1\n'
  };
  await evaluate(`localStorage.setItem('dynlex-studio-program-project',${JSON.stringify(JSON.stringify({entry:'main.dl',files}))})`);
  await command('Page.navigate',{url:origin+'/ide/'});
  await waitFor('window.colorProbe?.some(item=>item.text.trim()==="main.dl")');
  await studioToolbar({controls,evaluate},'Debug');
  await waitFor('window.siteProbe.debugEvents.some(event=>event.type==="program-paused")');
  await controls.key('F11','F11',122);
  await waitFor(`document.querySelector('textarea')?.value===${JSON.stringify(files['first.dl'])}`);
  assert.equal(await evaluate('document.querySelector("textarea").readOnly'),false);
  await controls.key('F11','F11',122);
  await waitFor(`document.querySelector('textarea')?.value===${JSON.stringify(files['tools/second.dl'])}`);
  assert.equal(await evaluate('document.querySelector("textarea").readOnly'),false);
  await controls.key('F5','F5',116);
  await waitFor('window.siteProbe.programOutput==="2\\n"');
  await capture('debugger-unvisited-project-sources');
  console.log('Step Into opens unvisited SDK and nested project sources; Stop discards a delayed source reply.');
}
