// Smoke test: plays the built game (dist/) like a player would and checks that it works.
// Menus, intro, 20 s of flight while firing, frame rate, pause, console errors. Screenshots and a
// report go to test-results/smoke/. The exit code is 0 when every check passes.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'test-results', 'smoke');
const MIN_FPS = Number(process.env.SMOKE_MIN_FPS ?? 30);
const FLIGHT_SECONDS = 20;
const WATCHDOG_MS = 120_000;
const SCREEN_FADE_MS = 900;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const errors = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` (${detail})` : ''}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // The window must be visible: a hidden one runs at about 1 frame per second. A blank,
  // in-memory session keeps the player's records, gold and settings out of the test.
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    show: true,
    webPreferences: { backgroundThrottling: false, partition: `smoke-${Date.now()}` },
  });
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) errors.push(message);
  });
  win.webContents.on('render-process-gone', (_event, details) => errors.push(`renderer gone: ${details.reason}`));

  const page = (code) => win.webContents.executeJavaScript(code);
  const visible = (id) => `!document.getElementById('${id}').classList.contains('hidden')`;
  const waitFor = async (expression, timeoutMs = 10_000) => {
    for (const start = Date.now(); Date.now() - start < timeoutMs; await sleep(100)) {
      if (await page(expression)) return true;
    }
    return false;
  };
  // Screens fade in over 0.8 s (style.css): wait for it, or the capture shows the previous screen.
  const shot = async (name) => {
    await sleep(SCREEN_FADE_MS);
    fs.writeFileSync(path.join(OUT, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const key = (keyCode, type = 'keyDown') => win.webContents.sendInputEvent({ type, keyCode });
  const click = (id) => page(`document.getElementById('${id}').click()`);
  const fps = () =>
    page(`new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      const tick = () => (++frames, performance.now() - start < 2000 ? requestAnimationFrame(tick) : resolve(frames / ((performance.now() - start) / 1000)));
      requestAnimationFrame(tick);
    })`);

  await win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  check('the title screen appears', await waitFor(visible('menu'), 20_000));
  await sleep(1500);
  await shot('1-menu');
  const chips = await page(`[document.querySelectorAll('#level-choices .chip').length, document.querySelectorAll('#difficulty-choices .chip').length]`);
  check('three levels and three difficulties to choose from', chips[0] === 3 && chips[1] === 3, `${chips[0]} levels, ${chips[1]} difficulties`);

  await click('open-options');
  check('Options opens', await waitFor(visible('options'), 2000));
  await shot('2-options');
  await click('options-close');
  check('Options closes back to the title screen', await waitFor(visible('menu'), 2000));

  await click('open-shop');
  check('Upgrades opens', await waitFor(visible('shop'), 2000));
  await shot('3-upgrades');
  await click('shop-close');
  check('Upgrades closes back to the title screen', await waitFor(visible('menu'), 2000));

  await click('start');
  check('the level intro plays', await waitFor(visible('intro-card'), 3000));
  await sleep(1200);
  await shot('4-intro');
  key('Enter');
  key('Enter', 'keyUp');
  check('the intro can be skipped', await waitFor(visible('hud'), 3000));
  check('the first-launch tutorial shows its first hint', await waitFor(visible('hint'), 3000));

  key('Space'); // held for the whole flight: fireballs and flame jet
  for (let second = 1; second <= FLIGHT_SECONDS; second++) {
    const turn = second % 6 < 3 ? 'Left' : 'Right';
    key(turn);
    await sleep(1000);
    key(turn, 'keyUp');
    if (second === 6 || second === 16) await shot(`5-flight-${second}s`);
  }
  const measured = await fps();
  key('Space', 'keyUp');
  const score = Number(await page(`document.getElementById('score').textContent`));
  check(`points scored in ${FLIGHT_SECONDS} s of flight`, score > 0, `${score} points`);
  check(`frame rate of at least ${MIN_FPS} FPS`, measured >= MIN_FPS, `${measured.toFixed(0)} FPS`);

  key('Escape');
  check('Escape pauses the game', await waitFor(visible('pause'), 2000));
  await shot('6-pause');
  await click('pause-quit');
  check('quitting goes back to the title screen', await waitFor(visible('menu'), 3000));

  check('no error in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
  const passed = checks.every((c) => c.ok);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ passed, fps: measured, score, checks, errors }, null, 2));
  console.log(`\n${passed ? 'Smoke test passed' : 'Smoke test FAILED'}: ${checks.filter((c) => c.ok).length}/${checks.length} checks. Screenshots: ${OUT}`);
  return passed;
}

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => {
    console.error('Smoke test timed out');
    app.exit(1);
  }, WATCHDOG_MS);
  let passed = false;
  try {
    passed = await main();
  } catch (error) {
    console.error('Smoke test crashed:', error);
  }
  clearTimeout(watchdog);
  app.exit(passed ? 0 : 1);
});
