import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const widths = [320, 360, 390, 430, 768, 1024, 1280];
const page = '/kb/smartfarm-guide.html';
const port = 18810;
const debugPort = 19264;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-phase6c-chrome-'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404); response.end('not found'); return;
  }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' }[path.extname(target).toLowerCase()] || 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(target).pipe(response);
});

class CdpSocket {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  open() { return new Promise((resolve, reject) => { this.socket = new WebSocket(this.url); this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); this.socket.addEventListener('message', (event) => this.receive(JSON.parse(event.data))); }); }
  send(method, params = {}) { const id = ++this.id; const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); this.socket.send(JSON.stringify({ id, method, params })); return promise; }
  on(method, callback) { this.listeners.set(method, [...(this.listeners.get(method) || []), callback]); }
  once(method) { return new Promise((resolve) => { const callback = (params) => { this.listeners.set(method, (this.listeners.get(method) || []).filter((item) => item !== callback)); resolve(params); }; this.on(method, callback); }); }
  receive(message) { if (message.id) { const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); return; } for (const callback of this.listeners.get(message.method) || []) callback(message.params); }
  close() { this.socket?.close(); }
}

let chrome;
let socket;
try {
  assert.ok(fs.existsSync(chromePath), 'Chrome is required');
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) { try { if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) { ready = true; break; } } catch {} await delay(100); }
  assert.ok(ready, 'Chrome debugging is available');
  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json());
  socket = new CdpSocket(target.webSocketDebuggerUrl);
  await socket.open();
  await socket.send('Page.enable'); await socket.send('Runtime.enable'); await socket.send('Network.enable');
  const missing = []; const fatal = [];
  socket.on('Network.responseReceived', ({ response }) => { if (response?.url.startsWith(`http://127.0.0.1:${port}`) && response.status >= 400 && !new URL(response.url).pathname.startsWith('/api/')) missing.push(`${response.status} ${response.url}`); });
  socket.on('Runtime.exceptionThrown', ({ exceptionDetails }) => fatal.push(exceptionDetails?.text || 'exception'));
  for (const width of widths) {
    await socket.send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: width <= 430 });
    const loaded = socket.once('Page.loadEventFired');
    await socket.send('Page.navigate', { url: `http://127.0.0.1:${port}${page}` });
    await loaded; await delay(250);
    const result = await socket.send('Runtime.evaluate', { expression: "(()=>({h1:document.querySelectorAll('h1').length,overflow:document.documentElement.scrollWidth>innerWidth+1,heading:[...document.querySelectorAll('h1,h2,h3')].some(el=>el.scrollWidth>el.clientWidth+1),sources:document.querySelectorAll('.source-card').length,sourceOverflow:[...document.querySelectorAll('.source-card a')].some(el=>el.scrollWidth>el.clientWidth+1),cards:document.querySelectorAll('nav[aria-label=\"스마트팜 핵심 기술정보\"] a').length,breadcrumb:!!document.querySelector('.breadcrumb'),favicon:document.querySelector('link[rel~=icon]')?.getAttribute('href')}))()", returnByValue: true });
    const value = result.result.value;
    assert.equal(value.h1, 1, `${width}px H1`);
    assert.equal(value.overflow, false, `${width}px horizontal overflow`);
    assert.equal(value.heading, false, `${width}px heading overflow`);
    assert.equal(value.sources, 5, `${width}px official sources`);
    assert.equal(value.sourceOverflow, false, `${width}px source overflow`);
    assert.equal(value.cards, 4, `${width}px keyboard-accessible links`);
    assert.equal(value.breadcrumb, true, `${width}px breadcrumb`);
    assert.equal(value.favicon, '/static/kfarmai-logo-horizontal.png', `${width}px favicon`);
  }
  for (const [route, selector] of [
    ['/mfg.html?category=smart-agriculture', 'a[href="kb/smartfarm-guide.html"]'],
    ['/agri-info.html', 'a[href="/kb/smartfarm-guide.html"]'],
  ]) {
    await socket.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1100, deviceScaleFactor: 1, mobile: true });
    const loaded = socket.once('Page.loadEventFired');
    await socket.send('Page.navigate', { url: `http://127.0.0.1:${port}${route}` });
    await loaded; await delay(450);
    const result = await socket.send('Runtime.evaluate', { expression: `Boolean(document.querySelector(${JSON.stringify(selector)}))`, returnByValue: true });
    assert.equal(result.result.value, true, `${route} renders smartfarm hub link`);
  }
  assert.deepEqual(missing, [], `assets: ${missing.join(', ')}`);
  assert.deepEqual(fatal, [], `console: ${fatal.join(', ')}`);
  console.log('Phase 6C responsive preview: 7/7 widths PASS; asset 404 0; console fatal 0');
} finally {
  try { await socket?.send('Browser.close'); } catch {}
  socket?.close();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (chrome && !chrome.killed) chrome.kill();
  await delay(250);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
}
