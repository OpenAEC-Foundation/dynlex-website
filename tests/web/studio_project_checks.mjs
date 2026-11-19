// Exercise the project through rendered controls and ordinary keyboard/pointer input.
import assert from 'node:assert/strict';

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
    await clickText('File path');
    const field=await evaluate(`window.colorProbe.filter(item=>item.text.trim()===${JSON.stringify(oldPath)} && item.y>window.colorProbe.find(item=>item.text.trim()==='File path').y).at(0)`);
    assert(field,'The file path input must be visible below its label');
    await click(field.x,field.y);
    await replace(path);
  };
  const helper='tools/math/double.dl',renamed='tools/math/twice.dl';
  const contents='{number} doubled means: @intrinsic("add", number, number)';
  await editPath('main.dl',helper);
  await clickText('New file');
  await waitFor("document.querySelector('textarea').value===''");
  await replace(contents);
  await editPath(helper,renamed);
  await clickText('Rename file');
  await clickText('Main file');
  const program='import lib/std.dl\nimport '+renamed+'\nprint line (21 doubled)';
  await replace(program);
  await clickText('Run program ▶');
  await waitFor('window.siteProbe.texts.some(item=>item.trim()==="42")');
  await command('Page.reload',{});
  await waitFor('window.siteProbe?.visible.includes("main.dl")');
  await clickText('▸ tools');
  await clickText('▸ math');
  await clickText('twice.dl');
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(contents)}`);
  await capture('nested-project-file');
  await clickText('Main file');
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(program)}`);
  await key('End','End',35,2);
  for(let i=0;i<3;i++) await key('ArrowLeft','ArrowLeft',37);
  await clickText('Definition');
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(contents)}`);
  await clickText('Delete file');
  await clickText('Confirm delete');
  await waitFor(`document.querySelector('textarea').value===${JSON.stringify(program)}`);
  await clickText('▸ Libraries');
  await clickText('▸ lib');
  await clickText('array.dl');
  await waitFor('window.siteProbe.visible.includes("array.dl · Read only")');
  console.log('Studio creates, edits, renames, compiles, restores, navigates and deletes project files and opens library source.');
}
