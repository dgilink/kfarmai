import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-v4-mobile-'));
const widths = [320, 360, 390, 412];
const routes = ['/index.html', '/channel.html', '/kb/index.html'];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let port = 0;
let debugPort = 0;
let chrome;
let socket;

function resolveRequest(rawUrl) {
  const url = new URL(rawUrl, `http://127.0.0.1:${port}`);
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  return target;
}

const server = http.createServer((request, response) => {
  const target = resolveRequest(request.url || '/');
  if (!target) { response.writeHead(404); response.end('not found'); return; }
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[path.extname(target).toLowerCase()] || 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(response);
});

class CdpSocket {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  open() { return new Promise((resolve, reject) => { this.socket = new WebSocket(this.url); this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); this.socket.addEventListener('message', event => this.receive(JSON.parse(event.data))); }); }
  send(method, params = {}) { const id = ++this.id; const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); this.socket.send(JSON.stringify({ id, method, params })); return promise; }
  on(method, callback) { this.listeners.set(method, [...(this.listeners.get(method) || []), callback]); }
  once(method) { return new Promise(resolve => { const callback = params => { this.listeners.set(method, (this.listeners.get(method) || []).filter(item => item !== callback)); resolve(params); }; this.on(method, callback); }); }
  receive(message) { if (message.id) { const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); return; } for (const callback of this.listeners.get(message.method) || []) callback(message.params); }
  close() { this.socket?.close(); }
}

async function evaluate(expression) {
  const result = await socket.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function navigate(route) {
  const loaded = socket.once('Page.loadEventFired');
  await socket.send('Page.navigate', { url: `http://127.0.0.1:${port}${route}` });
  await loaded;
  await delay(350);
  assert.equal(await evaluate("document.readyState"), 'complete', route);
  assert.equal(await evaluate("document.querySelectorAll('.v4-nav').length"), 1, `${route} single nav`);
}

async function touchSwipe(selector) {
  const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.left+r.width/2,y1:Math.min(innerHeight-90,r.bottom-40),y2:Math.max(90,r.top+40)}; })()`);
  await socket.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y1, radiusX: 2, radiusY: 2, force: 1 }] });
  for (let step = 1; step <= 8; step += 1) {
    const y = point.y1 + (point.y2 - point.y1) * step / 8;
    await socket.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y, radiusX: 2, radiusY: 2, force: 1 }] });
    await delay(20);
  }
  await socket.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await delay(250);
}

try {
  assert.ok(fs.existsSync(chromePath), 'Chrome is required');
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const portFile = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(portFile)) { debugPort = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]); break; }
    await delay(100);
  }
  assert.ok(debugPort, 'Chrome debugging is available');
  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then(response => response.json());
  socket = new CdpSocket(target.webSocketDebuggerUrl);
  await socket.open();
  await socket.send('Page.enable'); await socket.send('Runtime.enable'); await socket.send('Network.enable');
  const fatal = [];
  socket.on('Runtime.exceptionThrown', event => fatal.push(event.exceptionDetails?.text || 'exception'));

  for (const width of widths) {
    await socket.send('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: 720 });
    await socket.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    for (const route of routes) {
      await navigate(route);
      const initial = await evaluate(`(() => ({
        xOverflow: document.documentElement.scrollWidth - innerWidth,
        navs: document.querySelectorAll('.v4-nav').length,
        menus: document.querySelectorAll('#v4AllMenu').length,
        active: document.querySelectorAll('.v4-nav:not(.is-menu-open) [aria-current="page"]').length,
        scrollHeight: document.scrollingElement.scrollHeight,
        clientHeight: document.scrollingElement.clientHeight,
        phoneOverflow: document.querySelector('.phone') ? getComputedStyle(document.querySelector('.phone')).overflowY : null,
        touchAction: getComputedStyle(document.scrollingElement).touchAction,
      }))()`);
      assert.ok(initial.xOverflow <= 1, `${route} ${width}px horizontal overflow`);
      assert.equal(initial.navs, 1, `${route} ${width}px single nav`);
      assert.equal(initial.menus, 1, `${route} ${width}px single menu`);
      assert.equal(initial.active, 1, `${route} ${width}px one page tab active`);
      assert.ok(initial.scrollHeight > initial.clientHeight, `${route} ${width}px has vertical content`);
      if (route === '/index.html') assert.equal(initial.phoneOverflow, 'visible', `${route} ${width}px unclipped phone`);

      await touchSwipe('body');
      assert.ok(await evaluate('scrollY > 0'), `${route} ${width}px touch scroll down`);
      await evaluate('scrollTo(0, document.scrollingElement.scrollHeight)');
      await delay(100);
      const bottom = await evaluate(`(() => { const nav=document.querySelector('.v4-nav').getBoundingClientRect(); return {atBottom:scrollY+innerHeight>=document.scrollingElement.scrollHeight-2,navTop:nav.top,viewport:innerHeight}; })()`);
      assert.ok(bottom.atBottom, `${route} ${width}px reaches last content`);
      await touchSwipe('body');
      await evaluate('scrollTo(0, Math.max(80, scrollY))');
      const savedY = await evaluate('scrollY');

      await evaluate("document.body.style.setProperty('overflow','auto'); document.querySelector('.v4-nav button').click()");
      const opened = await evaluate(`(() => ({
        active: document.querySelectorAll('.v4-nav.is-menu-open [aria-expanded="true"]').length,
        semanticCurrent: document.querySelectorAll('.v4-nav [aria-current="page"]').length,
        expanded: document.querySelectorAll('.v4-nav [aria-expanded="true"]').length,
        locked: getComputedStyle(document.body).overflow === 'hidden',
        links: [...document.querySelectorAll('#v4AllMenu a')].every(link => link.getAttribute('href')),
        minRows: [...document.querySelectorAll('#v4AllMenu a')].every(link => link.getBoundingClientRect().height >= 44),
        menuScrollable: v4AllMenu.scrollHeight > v4AllMenu.clientHeight,
      }))()`);
      assert.equal(opened.active, 1, `${route} ${width}px only menu active`);
      assert.equal(opened.semanticCurrent, 1, `${route} ${width}px aria-current retained`);
      assert.equal(opened.expanded, 1, `${route} ${width}px one expanded control`);
      assert.ok(opened.locked && opened.links && opened.minRows, `${route} ${width}px open menu contract`);
      if (opened.menuScrollable) {
        await touchSwipe('#v4AllMenu');
        assert.ok(await evaluate('v4AllMenu.scrollTop > 0'), `${route} ${width}px menu touch scroll`);
        await evaluate('v4AllMenu.scrollTop = v4AllMenu.scrollHeight');
      }
      assert.ok(await evaluate("document.querySelector('#v4AllMenu a:last-of-type').getBoundingClientRect().bottom <= document.querySelector('.v4-nav').getBoundingClientRect().top + 1"), `${route} ${width}px last menu link reachable`);
      await evaluate("document.querySelector('.v4-nav button').click()");
      const closed = await evaluate(`(() => ({active:document.querySelectorAll('.v4-nav:not(.is-menu-open) [aria-current="page"]').length,overflow:document.body.style.overflow,y:scrollY,hidden:v4AllMenu.hidden}))()`);
      assert.equal(closed.active, 1, `${route} ${width}px page active restored`);
      assert.equal(closed.overflow, 'auto', `${route} ${width}px inline overflow restored`);
      assert.equal(closed.y, savedY, `${route} ${width}px scroll position restored`);
      assert.equal(closed.hidden, true, `${route} ${width}px menu closed`);
      await evaluate("document.body.style.removeProperty('overflow')");
    }
  }

  await socket.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 720, deviceScaleFactor: 1, mobile: true });
  await navigate('/index.html');
  await evaluate("document.querySelector('.v4-nav button').click(); history.pushState({},'',location.pathname+'?menu=1'); history.back()");
  await delay(300);
  assert.deepEqual(await evaluate(`({hidden:v4AllMenu.hidden,active:document.querySelectorAll('.v4-nav:not(.is-menu-open) [aria-current="page"]').length,overflow:document.body.style.overflow})`), { hidden: true, active: 1, overflow: '' }, 'popstate restores closed menu');
  await socket.send('Page.reload', { ignoreCache: true });
  await socket.once('Page.loadEventFired');
  await delay(250);
  assert.deepEqual(await evaluate(`({navs:document.querySelectorAll('.v4-nav').length,menus:document.querySelectorAll('#v4AllMenu').length,active:document.querySelectorAll('.v4-nav:not(.is-menu-open) [aria-current="page"]').length})`), { navs: 1, menus: 1, active: 1 }, 'reload has no duplicate shell');
  assert.deepEqual(fatal, [], `browser fatal errors: ${fatal.join(' | ')}`);
  console.log(`V4 mobile nav/scroll browser: ${widths.length * routes.length}/${widths.length * routes.length} page-width checks PASS`);
} finally {
  try { await socket?.send('Browser.close'); } catch {}
  socket?.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  if (chrome?.exitCode === null && !chrome.killed) chrome.kill();
  await delay(250);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
