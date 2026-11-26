import assert from 'node:assert/strict';

export async function studioMenu(controls,menu,item) {
  await controls.chooseMenuItem(menu,item);
}

export async function studioToolbar({controls,evaluate},caption) {
  const point=await evaluate(`(() => {
    const boundary=window.colorProbe.find(item=>item.text.trim()==='Program').y;
    return window.colorProbe.filter(item=>item.text.trim()===${JSON.stringify(caption)} && item.y<boundary).at(-1);
  })()`);
  assert(point,'The toolbar must expose '+caption);
  await controls.click(point.x,point.y);
}

export async function sourceToolbar({controls,command,evaluate,waitFor},filename,action) {
  const captions={Back:'Go back (Alt+Left)','Main file':'Main file',Definition:'Go to definition (F12)',Outline:'Outline (Ctrl+Shift+O)',Instances:'Instances',Fixes:'Quick fixes',Find:'Find (Ctrl+F)'};
  const offset={Back:-54,'Main file':-22,Definition:22,Outline:54,Instances:86,Fixes:118,Find:150};
  const label=await evaluate(`window.colorProbe.find(item=>item.text.trim()===${JSON.stringify(filename)} && item.x<innerWidth*0.7)`);
  assert(label,'The source header must identify '+filename);
  const x=label.x+(offset[action]<0?-label.width/2:label.width/2)+offset[action],y=label.y;
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  await waitFor(`window.colorProbe.some(item=>item.text.trim()===${JSON.stringify(captions[action])})`);
  await controls.click(x,y);
}
