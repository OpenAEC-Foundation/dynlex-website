import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {promisify} from 'node:util';
import {inflateRaw} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {compilerPath} from '../../scripts/dependencies.mjs';

export async function verifyLibraryDirectory({command,evaluate,waitFor,controls,capture,origin,assetBase,downloadEvents}) {
  const {readArchive,verifyPackage}=await import(pathToFileURL(compilerPath('packages/archive.mjs')).href);
  const catalogUrl=new URL(assetBase+'libraries/index.json',origin);
  const {libraries}=await (await fetch(catalogUrl)).json();
  assert(libraries.length>0,'The release must publish its libraries');
  for(const entry of libraries) {
    const response=await fetch(new URL(entry.source.url,catalogUrl));
    assert.equal(response.status,200);
    const archive=await verifyPackage(await readArchive(new Uint8Array(await response.arrayBuffer()),promisify(inflateRaw)));
    assert.equal(archive.manifest.package,entry.name);
    assert.equal(archive.manifest.contentHash,entry.source.contentHash);
  }
  const navigation=await evaluate('window.colorProbe.find(item=>item.text.trim()==="Libraries" && item.y<80)');
  assert(navigation,'The header must link to the library directory');
  await controls.click(navigation.x,navigation.y);
  await waitFor('location.pathname==="/libraries/index.html" && document.title==="DynLex Libraries"');
  const count=number=>`${number} ${number===1?'library':'libraries'}`;
  await waitFor(`window.siteProbe.visible.includes(${JSON.stringify(count(libraries.length))})`);
  await capture('libraries-desktop');
  const search=async query=>{
    await controls.clickText('Clear search');
    const label=await controls.revealText('Search libraries');
    await controls.click(label.x,label.y+48);
    await waitFor('!document.querySelector("textarea").readOnly');
    await controls.key('KeyA','a',65,2);
    await command('Input.insertText',{text:query});
    const matches=libraries.filter(entry=>['name','title','publisher','description','alias'].map(key=>entry[key]).join(' ').toLowerCase().includes(query.toLowerCase()));
    await waitFor(`window.siteProbe.visible.includes(${JSON.stringify(count(matches.length))})`);
    return matches;
  };
  const entry=libraries[0];
  assert((await search(entry.name.toUpperCase())).some(item=>item.name===entry.name));
  await capture('libraries-search');
  await search(entry.publisher);
  await search(entry.description);
  assert.equal((await search('___no_matching_library___')).length,0);
  await waitFor('window.siteProbe.texts.some(text=>text.includes("No libraries match your search."))');
  await capture('libraries-empty');
  await controls.clickText('Clear search');
  await waitFor(`window.siteProbe.visible.includes(${JSON.stringify(count(libraries.length))})`);
  if(entry.documentation) {
    await controls.clickText(entry.title+' documentation ↗');
    let target;
    for(let attempt=0;attempt<100&&!target;attempt++) {
      const {targetInfos}=await command('Target.getTargets');
      target=targetInfos.find(item=>item.url===entry.documentation||item.url===entry.documentation+'/');
      if(!target) await pause(100);
    }
    assert(target,'The documentation link did not open its declared URL');
    await command('Target.closeTarget',{targetId:target.targetId});
  }
  await command('Browser.setDownloadBehavior',{behavior:'deny',eventsEnabled:true});
  await controls.clickText('Download '+entry.title+' ↓');
  const expected=new URL(entry.source.url,catalogUrl).href;
  for(let attempt=0;attempt<100&&!downloadEvents.some(item=>item.url===expected);attempt++) await pause(100);
  assert(downloadEvents.some(item=>item.url===expected&&item.suggestedFilename.endsWith('.zip')),'The download button did not start the pinned ZIP download');
  assert.equal(await evaluate('location.pathname'),'/libraries/index.html');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await controls.clickText('Clear search');
  await capture('libraries-mobile');
  await controls.revealText('Download '+entry.title+' ↓');
  await capture('libraries-mobile-download');
  console.log('Public library directory: navigation, metadata search, empty/clear states, documentation, verified SDK ZIPs, download button and mobile layout passed.');
}
