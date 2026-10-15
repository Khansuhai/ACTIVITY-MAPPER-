/**
 * Records the README demo video with headless Chrome, using the app's own exporter:
 * loads the sample hike and a few sample photos into the dev server, exports an MP4 and saves it
 * to tmp/captures/demo.mp4 (via the dev-only /__dev/save endpoint in vite.config.ts).
 *
 * Needs: `pnpm dev` running, `pnpm sample:photos` done, Chrome installed.
 * Run: node scripts/capture-demo.mjs [--probe] [--with-photos]
 * (The sample photos are synthetic gradients, so the README demo leaves them out by default.)
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = 'http://localhost:5173/';
const PORT = 9333;
const probe = process.argv.includes('--probe');
const withPhotos = process.argv.includes('--with-photos');

const PROFILE = resolve('tmp/chrome-profile');
mkdirSync(PROFILE, { recursive: true });
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--window-size=1280,800',
    '--no-first-run',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

try {
  let targets;
  for (let i = 0; i < 150 && !targets; i++) {
    targets = await fetch(`http://127.0.0.1:${PORT}/json`)
      .then((r) => r.json())
      .catch(() => null);
    if (!targets) await sleep(200);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const run = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails)
      throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    return r.result?.result?.value;
  };

  await send('Page.enable');
  await send('Page.navigate', { url: APP });
  await sleep(4000);

  const gpu = await run(`(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'no webgl2';
  })()`);
  console.log('WebGL renderer:', gpu);
  if (probe) process.exit(0);

  console.log(`Loading the sample hike${withPhotos ? ' and photos' : ''}, starting export…`);
  await run(`(async () => {
    const pick = ${withPhotos} ? ['photo-02.jpg', 'photo-07.jpg', 'photo-12.jpg', 'photo-19.jpg'] : [];
    const files = [new File([await fetch('/samples/sample-hike.gpx').then((r) => r.arrayBuffer())], 'sample-hike.gpx')];
    for (const f of pick) files.push(new File([await fetch('/tmp/sample-photos/' + f).then((r) => r.blob())], f, { lastModified: 1 }));
    const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise((res) => { const iv = setInterval(() => { const s = window.__photos.getState().items; if (s.length === pick.length && s.every((i) => i.status !== 'reading')) { clearInterval(iv); res(); } }, 200); });
    await new Promise((r) => setTimeout(r, 3000));
    const sel = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    const inp = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const style = document.querySelector('section[aria-labelledby=style-title]');
    const [colour] = style.querySelectorAll('select');
    sel.call(colour, 'elevation'); colour.dispatchEvent(new Event('change', { bubbles: true }));
    const ex = document.querySelector('section[aria-labelledby=export-title]');
    const [shape, quality, rate] = ex.querySelectorAll('select');
    sel.call(shape, '16:9'); shape.dispatchEvent(new Event('change', { bubbles: true }));
    sel.call(quality, '720p'); quality.dispatchEvent(new Event('change', { bubbles: true }));
    sel.call(rate, '30'); rate.dispatchEvent(new Event('change', { bubbles: true }));
    const slider = ex.querySelector('input[type=range]');
    inp.call(slider, '25'); slider.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const box = ex.querySelector('input[type=checkbox]'); if (box && box.checked) box.click();
    await new Promise((r) => setTimeout(r, 300));
    [...ex.querySelectorAll('button')].find((b) => b.textContent.startsWith('Export')).click();
  })()`);

  const started = Date.now();
  for (;;) {
    await sleep(5000);
    const status = await run(`(() => {
      const ex = document.querySelector('section[aria-labelledby=export-title]');
      return ex.innerText.match(/Frame \\d+ of \\d+[^\\n]*|Save video[^\\n]*|Export failed[^\\n]*|Preparing map…/)?.[0] ?? '?';
    })()`);
    console.log(`${Math.round((Date.now() - started) / 1000)}s ${status}`);
    if (status.startsWith('Save video')) break;
    if (status.startsWith('Export failed')) throw new Error(status);
  }
  const saved = await run(`(async () => {
    const blob = await fetch(document.querySelector('a[download]').href).then((r) => r.blob());
    return fetch('/__dev/save?name=demo.mp4', { method: 'POST', body: blob }).then((r) => r.text());
  })()`);
  console.log('demo.mp4:', saved);
  ws.close();
} finally {
  chrome.kill();
}
