// Exercise debugger controls through the rendered editor and ordinary input.
import assert from 'node:assert/strict';
import {studioMenu,studioToolbar} from './studio_controls.mjs';

export async function verifyStudioDebugger({command,evaluate,waitFor,controls,capture,origin}) {
  const {clickText,key}=controls;
  await command('Page.navigate',{url:origin+'/ide/'});
  await waitFor('window.siteProbe?.visible.includes("main.dl")');
  await controls.revealText('Run');
  await waitFor('window.colorProbe.some(item=>item.text.includes("import"))');
  const sourcePoint=await evaluate('window.colorProbe.find(item=>item.text.includes("import"))');
  await controls.click(sourcePoint.x,sourcePoint.y);
  const source="import lib/std.dl\nset items to [4, 5]\nset counter to 1\nreport counter\nset counter to 9\nprint line counter\n\nto report {integer:number}:\n    set increased to number + 1\n    print line increased\n";
  await key('KeyA','a',65,2);
  await command('Input.insertText',{text:source});
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(source)}`);
  await studioToolbar({controls,evaluate},'Debug');
  const paused=async count=>{
    await waitFor(`window.siteProbe.debugEvents.filter(event=>event.type==='program-paused').length===${count}`);
    await waitFor('document.activeElement===document.querySelector("textarea") && window.colorProbe.some(item=>item.text.includes("import") && item.x<innerWidth/2)');
  };
  const latest="window.siteProbe.debugEvents.filter(event=>event.type==='program-paused').at(-1)";
  await paused(1);
  await key('F10','F10',121); await paused(2);
  await key('F10','F10',121); await paused(3);
  assert.equal(await evaluate(`${latest}.frames[0].variables.find(item=>item.name==='counter').value`),'1');
  await waitFor('window.colorProbe.filter(item=>item.text.trim()==="counter").length>1');
  const point=await evaluate('window.colorProbe.filter(item=>item.text.trim()==="counter")[1]');
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
  await waitFor('window.siteProbe.visible.includes("Paused value: 1")');
  await capture('debugger-runtime-hover');
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});
  const expandItems=async()=>{
    const item=await evaluate(`${latest}.frames.flatMap(frame=>frame.variables).find(item=>item.name==='items')`);
    assert(item.children>0,'The current frame must expose its expandable array');
    await clickText('+ items: '+item.type+' = '+item.value);
  };
  await expandItems();
  await waitFor('window.siteProbe.visible.some(text=>text.includes("[0]:") && text.endsWith("= 4")) && window.siteProbe.visible.some(text=>text.includes("[1]:") && text.endsWith("= 5"))');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:450,deviceScaleFactor:1,mobile:false});
  await controls.wheel(900);
  await waitFor('!window.colorProbe.some(item=>item.text.includes("import") && item.x<innerWidth/2)');

  await key('F11','F11',122); await paused(4);
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate(`${latest}.frames.length`),2);
  const caller=await evaluate(`${latest}.frames[1]`);
  await clickText(caller.name+' · line '+(caller.range.start.line+1));
  await waitFor(`document.querySelector('textarea').selectionStart===${source.indexOf('report counter')}`);
  await waitFor('window.siteProbe.visible.some(text=>text.includes("counter:") && text.endsWith("= 1"))');
  await evaluate('window.siteProbe.holdInspectorReply=true');
  await expandItems();
  await waitFor('window.siteProbe.delayedInspections===1');

  await key('F10','F10',121); await paused(5);
  assert.equal(await evaluate(`${latest}.frames[0].variables.find(item=>item.name==='increased').value`),'2');
  await capture('debugger-call-stack');
  await key('F11','F11',122,8); await paused(6);
  assert.equal(await evaluate(`${latest}.frames.length`),1);
  await key('Home','Home',36,2);
  for(let line=0;line<5;line++) await key('ArrowDown','ArrowDown',40);
  await key('F9','F9',120);
  await key('F5','F5',116); await paused(7);
  assert.equal(await evaluate(`${latest}.reason`),'breakpoint');
  assert.equal(await evaluate(`${latest}.frames[0].variables.find(item=>item.name==='counter').value`),'9');
  await capture('debugger-breakpoint');
  await key('F5','F5',116);
  await waitFor('window.siteProbe.programOutput==="2\\n9\\n"');
  await studioMenu(controls,'Debug','Clear breakpoints');
  await studioToolbar({controls,evaluate},'Debug'); await paused(8);
  await key('F5','F5',116,8);
  await waitFor('window.siteProbe.visible.includes("Stopped.")');
  await studioToolbar({controls,evaluate},'Debug'); await paused(9);
  await key('End','End',35,2);
  await command('Input.insertText',{text:'\n# Edited while paused\n'});
  await waitFor('window.siteProbe.visible.includes("Stopped.")');
  assert(!await evaluate('window.siteProbe.visible.some(text=>text.includes("Paused value:"))'), 'Editing retained a paused hover');
  console.log('Studio debugger controls, keyboard shortcuts, live hover, call stacks, array inspection, cancelled inspections, stepping, breakpoints, output, Stop and source edits passed.');
}
