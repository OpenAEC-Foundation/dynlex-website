import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';

export async function verifyResponsiveHome({command,evaluate,waitFor}) {
  const captions = () => evaluate(`Object.fromEntries(window.colorProbe.map(
    ({text, x, y, width, height}) => [text, {x,y,width,height}]))`);
  const resize = async (width, height, deviceScaleFactor, mobile) => {
    await evaluate('void (window.beforeResponsivePaint = window.colorProbe)');
    await command('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor,mobile});
    await waitFor(`innerWidth === ${width} && innerHeight === ${height} &&
      document.querySelector('canvas').width === ${width * deviceScaleFactor} &&
      window.colorProbe !== window.beforeResponsivePaint && window.colorProbe.length > 0`);
  };
  const desktop = await captions();
  assert(desktop['Code becomes'], 'The desktop headline should fit its first line.');
  try {
    for (const [width, height] of [[320, 568], [390, 844]]) {
      await resize(width, height, 2, true);
      const phone = await captions();
      assert(phone['Code becomes'] && phone['light.'], `The headline should fit two lines at ${width}px.`);
      assert(phone['Code becomes'].height < desktop['Code becomes'].height * 0.55,
        'A narrow viewport should scale the headline separately from desktop.');
      assert(Math.abs(phone['Next shader →'].y - phone['Open this shader ↗'].y) < 4,
        'The mobile hero actions should share a row.');
      assert(phone['DYNLEX / OPEN SKETCH'].y < 540, 'The hero should leave room for the next section.');
      assert(phone.Docs.y < 110, 'The mobile navigation should use a compact header.');
      if (width === 390) {
        await resize(width, height, 3, true);
        const denser = await captions();
        for (const label of ['DynLex', 'Code becomes', 'Next shader →'])
          assert(Math.abs(phone[label].y - denser[label].y) < 2, `Pixel density moved ${label}.`);
      }
    }
    await resize(624, 900, 2, true);
    const widePhone = await captions();
    assert(Math.abs(widePhone.Playground.y - widePhone.Docs.y) < 4,
      'A wider compact viewport should fit the navigation in one row.');
    for (const [width, height] of [[812, 375], [932, 430]]) {
      await resize(width, height, 2, true);
      const landscape = await captions();
      assert(landscape['Code becomes'] && landscape['Open this shader ↗']?.y < height - 5,
        `The landscape headline and actions should fit at ${width}×${height}.`);
    }
  } finally {
    await resize(1280, 900, 1, false);
  }
  console.log('The homepage adapts to phone, landscape and desktop widths at independent display densities.');
}

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
