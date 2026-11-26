// Test controls follow the shared renderer's clipped glyph geometry.
import {setTimeout as pause} from 'node:timers/promises';

export function canvasControls({command,evaluate,capture}) {
  const click=async(x,y)=>{
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
    await command('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  };
  const key=async(code,key,number,modifiers=0)=>{
    for(const type of ['keyDown','keyUp'])
      await command('Input.dispatchKeyEvent',{type,code,key,windowsVirtualKeyCode:number,modifiers});
  };
  // Captions may wrap into several lines; choose a visible part of the whole.
  const location=text=>`(() => {
    const target=${JSON.stringify(text)},entries=window.colorProbe;
    for(let start=0;start<entries.length;start++) {
      let caption='',point;
      for(let end=start;end<Math.min(entries.length,start+8);end++) {
        const entry=entries[end];
        const fragment=entry.text.trim();
        if(!fragment) continue;
        caption+=(caption?' ':'')+fragment;
        if(entry.y>(location.pathname.startsWith('/ide/')?0:(innerWidth<700?140:80))&&entry.y<innerHeight-20) point??=entry;
        if(caption===target&&point) return point;
        if(!target.startsWith(caption)) break;
      }
    }
    return null;
  })()`;
  const cursor=()=>evaluate('({x:innerWidth-20,y:Math.min(innerHeight-60,700)})');
  const wheel=async deltaY=>{
    const point=await cursor();
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await command('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY});
    await pause(200);
  };
  const textVisible=text=>location(text);
  const revealText=async(text,settle=350,reveal=true)=>{
    let stationary=0;
    const positions='JSON.stringify(window.colorProbe.map(item=>[item.text,Math.round(item.x),Math.round(item.y)]))';
    for(let attempt=0;attempt<100;attempt++) {
      let point=await evaluate(location(text));
      if(point) {
        await pause(settle);
        point=await evaluate(location(text));
        let stable=0;
        for(let sample=0;point && sample<40;sample++) {
          await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
          await pause(100);
          const next=await evaluate(location(text));
          stable=next && Math.abs(next.x-point.x)<0.5 && Math.abs(next.y-point.y)<0.5?stable+1:0;
          point=next;
          if(stable>=2) return point;
        }
      }
      if(!reveal) {await pause(50);continue;}
      const before=await evaluate(positions);
      // Start at the page's beginning before searching down a tall mobile view.
      await wheel(attempt===0?-100000:400);
      await pause(350);
      stationary=(await evaluate(positions))===before?stationary+1:0;
      if(stationary>=2) break;
    }
    await capture('command-missing');
    throw new Error('Could not reveal command: '+text+'\n'+
      await evaluate('JSON.stringify(window.colorProbe.map(item=>item.text))'));
  };
  const clickText=async(text,settle=350,reveal=true)=>{
    const point=await revealText(text,settle,reveal);
    await click(point.x,point.y);
    return point;
  };
  const clickVisibleText=(text,settle=350)=>clickText(text,settle,false);
  const chooseMenuItem=async(menu,text)=>{
    const owner=await revealText(menu);
    const matches=`window.colorProbe.filter(item=>item.text.trim()===${JSON.stringify(text)})`;
    const count=await evaluate(matches+'.length');
    await click(owner.x,owner.y);
    // Popups paint after the document, including any tab with the same caption.
    for(let attempt=0;attempt<100;attempt++) {
      const items=await evaluate(matches);
      if(items.length>count) {
        const item=items.at(-1);
        await click(item.x,item.y);
        return;
      }
      await pause(50);
    }
    await capture('menu-item-missing');
    throw new Error('Could not find '+text+' in the '+menu+' menu');
  };
  return {click,key,clickText,clickVisibleText,textVisible,revealText,wheel,chooseMenuItem};
}
