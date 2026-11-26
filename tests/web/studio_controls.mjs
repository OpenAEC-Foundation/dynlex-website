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
  const captions={Back:'Go back (Alt+Left)','Main file':'Main file',Outline:'Outline (Ctrl+Shift+O)',Instances:'Instances',Find:'Find (Ctrl+F)'};
  const offset={Back:-54,'Main file':-22,Outline:22,Instances:54,Find:86};
  const label=await evaluate(`window.colorProbe.find(item=>item.text.trim()===${JSON.stringify(filename)} && item.x<innerWidth*0.7)`);
  assert(label,'The source header must identify '+filename);
  const x=label.x+(offset[action]<0?-label.width/2:label.width/2)+offset[action],y=label.y;
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  await waitFor(`window.colorProbe.some(item=>item.text.trim()===${JSON.stringify(captions[action])})`);
  await controls.click(x,y);
}

export async function openSourceContext({controls,command,waitFor},text) {
  const {x,y}=await controls.revealText(text);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'right',buttons:2,clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'right',buttons:0,clickCount:1});
  await waitFor('window.colorProbe.some(item=>item.text.trim()==="Go to definition (F12)")');
}

export async function sourceContextDefinition(context,text) {
  await openSourceContext(context,text);
  const {controls}=context;
  await controls.clickText('Go to definition (F12)');
}
