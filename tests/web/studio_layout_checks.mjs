import assert from 'node:assert/strict';
import {studioMenu} from './studio_controls.mjs';
import {verifySourceCallColor,verifySourceNavigationAppearance} from './editor_feature_checks.mjs';

async function resizeStudio({command,evaluate,waitFor},width,height) {
  const paints=await evaluate('window.siteProbe.paints');
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await waitFor(`innerWidth===${width} && window.siteProbe.paints>${paints}`);
}

export async function verifyStudioGeometry({command,evaluate,waitFor,controls,capture}) {
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await waitFor('window.colorProbe?.some(item=>item.text.trim()==="DynLex Studio")');
  await waitFor('window.colorProbe.some(item=>item.text.trim().startsWith("import"))');
  await verifySourceCallColor({waitFor,text:'print line'});
  const source=await evaluate('window.colorProbe.find(item=>item.text.trim().startsWith("import"))');
  const inspector=await evaluate('window.colorProbe.find(item=>item.text.trim()==="Workspace")');
  assert(source.y<260,'The workspace must start near the app toolbar');
  assert(inspector.x>900,'The inspector must leave most of the width for the editor');
  assert(!await evaluate('window.colorProbe.some(item=>item.text.includes("Working ideas."))'));
  await verifySourceNavigationAppearance({waitFor,disabled:true});
  await capture('studio-desktop');
  await controls.clickText('File');
  await waitFor('window.colorProbe.some(item=>item.text.trim()==="New file") && window.colorProbe.some(item=>item.text.trim()==="Save source")');
  await capture('studio-file-menu');
  await controls.key('Escape','Escape',27);
  await waitFor('!window.colorProbe.some(item=>item.text.trim()==="Save source")');
  await resizeStudio({command,evaluate,waitFor},390,844);
  await waitFor('window.colorProbe.some(item=>item.text.trim().startsWith("import"))');
  const bounds=await evaluate('window.colorProbe.map(item=>({text:item.text,left:item.x-item.width/2,right:item.x+item.width/2}))');
  assert(bounds.every(item=>item.left>=-1 && item.right<=391),'Visible controls escaped the narrow viewport: '+JSON.stringify(bounds.filter(item=>item.left < -1 || item.right > 391)));
  await controls.clickText('Debug');
  await waitFor('window.colorProbe.some(item=>item.text.trim()==="Start debugging")');
  await capture('studio-mobile-menu');
  await controls.key('Escape','Escape',27);
  await resizeStudio({command,evaluate,waitFor},1280,900);
  console.log('Studio keeps a compact menu, editor-first workspace and bounded menus on desktop and narrow viewports.');
}

export async function verifyStudioShell({command,evaluate,waitFor,controls,capture}) {
  await studioMenu(controls,'View','Light theme');
  await waitFor('localStorage.getItem("dynlex-web-theme")==="light"');
  await capture('studio-light');
  await studioMenu(controls,'View','Dark theme');
  await waitFor('localStorage.getItem("dynlex-web-theme")==="dark"');
  await studioMenu(controls,'Help','Keyboard shortcuts');
  await waitFor('window.colorProbe.some(item=>item.text.includes("Shift+F5"))');
  await studioMenu(controls,'View','Files');
  await studioMenu(controls,'File','New file');
  await waitFor('document.activeElement===document.querySelector("textarea") && document.querySelector("textarea").value===""');
  await command('Input.insertText',{text:'abandoned.dl'});
  await controls.key('Escape','Escape',27);
  await waitFor('document.querySelector("textarea").value.includes("Hello from DynLex.")');
  const downloads=await evaluate('window.siteProbe.downloads.length');
  await controls.key('KeyS','s',83,2);
  await waitFor(`window.siteProbe.downloads.length===${downloads+1} && window.siteProbe.downloads[${downloads}].content!==undefined`);
  assert((await evaluate(`window.siteProbe.downloads[${downloads}].content`)).includes('Hello from DynLex.'));
  await resizeStudio({command,evaluate,waitFor},390,844);
  await studioMenu(controls,'File','New file');
  await waitFor('document.activeElement===document.querySelector("textarea") && document.querySelector("textarea").value===""');
  await waitFor('window.colorProbe.some(item=>item.text.trim()==="Create file")');
  await capture('studio-mobile-file');
  await controls.key('Enter','Enter',13);
  await waitFor('window.colorProbe.some(item=>item.text.trim()==="Enter a relative .dl file path.")');
  await controls.key('Escape','Escape',27);
  await resizeStudio({command,evaluate,waitFor},1280,900);
  await controls.clickText('import lib/std.dl');
  await controls.key('KeyA','a',65,2);
  await command('Input.insertText',{text:'unrecognized instruction'});
  await studioMenu(controls,'View','Problems');
  const problem=await controls.revealText("main.dl:1:1: This pattern couldn't be resolved");
  await capture('studio-problems');
  await controls.click(problem.x,problem.y);
  await controls.key('KeyA','a',65,2);
  await controls.key('KeyC','c',67,2);
  await waitFor('window.siteProbe.copiedText?.includes('+JSON.stringify("This pattern couldn't be resolved")+')');
  console.log('Studio menus preserve theme choices, keyboard help, global Save and cancellable file forms on desktop and mobile.');
}
