import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';

export async function verifyHomeShader({command,evaluate,waitFor}) {
  await waitFor('window.siteProbe.heroFrames > 2');
  const frames = () => evaluate('window.siteProbe.heroFrames');
  const beforeBlur = await frames();
  await evaluate('window.dispatchEvent(new Event("blur"))');
  await waitFor('!document.hidden && window.siteProbe.heroFrames > ' + (beforeBlur + 2));

  const {targetInfo:{targetId:home}} = await command('Target.getTargetInfo');
  const {targetId:other} = await command('Target.createTarget', {url:'about:blank'});
  try {
    await command('Target.activateTarget', {targetId:other});
    await waitFor('document.hidden');
    await pause(250);
    const hiddenFrames = await frames();
    await pause(400);
    assert.equal(await frames(), hiddenFrames, 'The shader kept rendering in a hidden tab.');
    await command('Target.activateTarget', {targetId:home});
    await waitFor('!document.hidden && window.siteProbe.heroFrames > ' + (hiddenFrames + 2));
  } finally {
    await command('Target.closeTarget', {targetId:other});
  }
  console.log('The home shader continues without focus and resumes after a hidden tab.');
}

export async function verifyMobileSwipe({command,evaluate,waitFor}) {
  const positions = 'JSON.stringify(window.colorProbe.map(item => [item.text, Math.round(item.y)]))';
  const before = await evaluate(positions);
  const url = await evaluate('location.href');
  await command('Emulation.setTouchEmulationEnabled', {enabled:true, maxTouchPoints:5});
  const touch = (type, y) => command('Input.dispatchTouchEvent', {
    type, touchPoints: y === undefined ? [] : [{x:195,y,id:1}],
  });
  try {
    await touch('touchStart', 725);
    for (const y of [695, 640, 570, 495, 420, 345, 265]) await touch('touchMove', y);
    await touch('touchEnd');
    await waitFor(positions + ' !== ' + JSON.stringify(before));
    assert.equal(await evaluate('location.href'), url, 'A swipe activated a link.');
  } finally {
    await command('Emulation.setTouchEmulationEnabled', {enabled:false});
  }
  console.log('Mobile Chrome touch scrolling updates the document without activating a link.');
}
