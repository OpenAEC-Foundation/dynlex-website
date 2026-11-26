// Exercise the project through rendered controls and ordinary keyboard/pointer input.
import assert from 'node:assert/strict';
import {studioMenu,studioToolbar,sourceToolbar} from './studio_controls.mjs';

export async function verifyStudioProject({command,evaluate,waitFor,controls,capture,origin}) {
  const {click,clickText,key}=controls;
  await command('Page.navigate',{url:origin+'/ide/'});
  await waitFor('window.siteProbe?.visible.includes("main.dl")');
  const replace=async text=>{
    await key('KeyA','a',65,2);
    await command('Input.insertText',{text});
    await waitFor(`document.querySelector('textarea').value===${JSON.stringify(text)}`);
  };
  const editPath=async (oldPath,path)=>{
    await waitFor(`document.activeElement===document.querySelector('textarea') && document.querySelector('textarea').value===${JSON.stringify(oldPath)}`);
    await replace(path);
  };
  const ctrlClick=async token=>{
    const {x,y}=await controls.revealText(token);
    await command('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1,modifiers:2});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1,modifiers:2});
  };
  const helper='tools/math/double.dl',renamed='tools/math/twice.dl';
  const contents='{number} doubled means: @intrinsic("add", number, number)';
  await studioMenu(controls,'File','New file');
  await editPath('',helper);
  await key('Enter','Enter',13);
  await waitFor("document.querySelector('textarea').value===''");
  await replace(contents);
  await studioMenu(controls,'File','Rename file');
  await editPath(helper,renamed);
  await key('Enter','Enter',13);
  await waitFor(`window.colorProbe.some(item=>item.text.trim()===${JSON.stringify(renamed)})`);
  await sourceToolbar({controls,command,evaluate,waitFor},renamed,'Main file');
  const program='import std.dl\nimport '+renamed+'\nprint line (21 doubled)';
  await replace(program);
  await studioToolbar({controls,evaluate},'Run');
  await waitFor('window.siteProbe.texts.some(item=>item.trim()==="42")');
  await studioMenu(controls,'Run','Copy output');
  await waitFor('window.siteProbe.copiedText==="42\\n"');
  await studioMenu(controls,'Run','Clear output');
  await waitFor('!window.colorProbe.some(item=>item.text.trim()==="42")');
  await ctrlClick('std.dl');
  await waitFor('window.siteProbe.visible.includes("std.dl · Read only")');
  await key('ArrowLeft','ArrowLeft',37,1);
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(program)}`);
  // F12 on a project import uses the same language-server lookup.
  await key('Home','Home',36,2);
  await key('ArrowDown','ArrowDown',40);
  await key('End','End',35);
  await key('ArrowLeft','ArrowLeft',37);
  await key('F12','F12',123);
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(contents)}`);
  await command('Page.reload',{});
  await waitFor('window.siteProbe?.visible.includes("main.dl")');
  await clickText('▸ tools');
  await clickText('▸ math');
  await clickText('twice.dl');
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(contents)}`);
  await capture('nested-project-file');
  await sourceToolbar({controls,command,evaluate,waitFor},renamed,'Main file');
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(program)}`);
  await key('End','End',35,2);
  for(let i=0;i<3;i++) await key('ArrowLeft','ArrowLeft',37);
  await sourceToolbar({controls,command,evaluate,waitFor},'main.dl','Definition');
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(contents)}`);
  await key('ArrowLeft','ArrowLeft',37,1);
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(program)}`);
  await key('Home','Home',36,2);
  await ctrlClick('doubled');
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(contents)}`);
  await studioMenu(controls,'File','Delete file');
  await clickText('Delete file');
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(program)}`);
  await clickText('▸ Libraries');
  await clickText('▸ lib');
  await clickText('array.dl');
  await waitFor('window.siteProbe.visible.includes("array.dl · Read only")');
  console.log('Studio creates, edits, renames, compiles, restores, navigates and deletes project files and opens library source.');
}
