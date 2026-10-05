import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-pages-artifact-'));
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-pages-preview-chrome-'));
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 18806;
const debugPort = 19242;
const pages = [
  '/', '/mfg.html', '/seed.html', '/santo.html', '/fert.html', '/cpa.html',
  '/channel.html', '/agri-info.html', '/kb/ras-recirculating-aquaculture.html',
  '/kb/land-aquaculture-water-quality.html', '/q/agricultural-insurance.html',
  '/kb/index.html', '/oauth/', '/oauth/privacy/', '/sitemap.xml', '/robots.txt',
];

let socket;
let server;
let chrome;

function contentType(target) {
  return {
    '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.xml': 'application/xml', '.txt': 'text/plain',
  }[path.extname(target).toLowerCase()] || 'application/octet-stream';
}

function resolveRequest(rawUrl) {
  const url = new URL(rawUrl, `http://127.0.0.1:${port}`);
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!relative) relative = 'index.html';
  let target = path.resolve(artifactDir, relative);
  if (!target.startsWith(`${artifactDir}${path.sep}`)) return null;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) && !path.extname(target)) target += '.html';
  return fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForDebug() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('Chrome DevTools endpoint did not start.');
}

class CdpSocket {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  open() { return new Promise((resolve, reject) => { this.socket = new WebSocket(this.url); this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); this.socket.addEventListener('message', (event) => this.receive(JSON.parse(event.data))); }); }
  send(method, params = {}) { const id = ++this.id; const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); this.socket.send(JSON.stringify({ id, method, params })); return promise; }
  on(method, callback) { const rows = this.listeners.get(method) || []; rows.push(callback); this.listeners.set(method, rows); }
  once(method) { return new Promise((resolve) => { const callback = (params) => { const rows = this.listeners.get(method) || []; this.listeners.set(method, rows.filter((item) => item !== callback)); resolve(params); }; this.on(method, callback); }); }
  receive(message) { if (message.id) { const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result); return; } for (const callback of this.listeners.get(message.method) || []) callback(message); }
  close() { this.socket?.close(); }
}

async function run() {
  const build = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/pages/build-pages-artifact.cjs'), `--output=${artifactDir}`], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  assert.ok(fs.existsSync(chromePath), 'Chrome executable is required for artifact preview.');

  server = http.createServer((request, response) => {
    const target = resolveRequest(request.url || '/');
    if (!target) { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('not found'); return; }
    response.writeHead(200, { 'Content-Type': `${contentType(target)}; charset=utf-8`, 'Cache-Control': 'no-store' });
    fs.createReadStream(target).pipe(response);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });

  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  await waitForDebug();
  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json());
  socket = new CdpSocket(target.webSocketDebuggerUrl);
  await socket.open();
  await socket.send('Page.enable');
  await socket.send('Runtime.enable');
  await socket.send('Network.enable');

  const fatal = [];
  const missing = [];
  let currentPage = '';
  socket.on('Runtime.exceptionThrown', (event) => fatal.push(event.params?.exceptionDetails?.text || 'runtime exception'));
  socket.on('Network.responseReceived', (event) => {
    const response = event.params?.response;
    if (!response?.url.startsWith(`http://127.0.0.1:${port}`) || response.status < 400) return;
    const pathname = new URL(response.url).pathname;
    if (pathname.startsWith('/api/')) return;
    if (pathname === '/favicon.ico' && /\.(?:xml|txt)$/.test(currentPage)) return;
    missing.push(`${response.status} ${pathname}`);
  });

  for (const page of pages) {
    currentPage = page;
    const loaded = socket.once('Page.loadEventFired');
    await socket.send('Page.navigate', { url: `http://127.0.0.1:${port}${page}` });
    await loaded;
    await delay(150);
    const status = await socket.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    assert.equal(status.result.value, 'complete', page);
  }

  assert.deepEqual([...new Set(missing)], [], `local artifact 4xx: ${missing.join(', ')}`);
  assert.deepEqual(fatal, [], `browser fatal errors: ${fatal.join(' | ')}`);
  console.log(`${pages.length}/${pages.length} Pages artifact preview routes PASS; asset 404 0; console fatal 0.`);
}

try {
  await run();
} finally {
  try { await socket?.send('Browser.close'); } catch {}
  socket?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (chrome && !chrome.killed) chrome.kill();
  await delay(150);
  fs.rmSync(artifactDir, { recursive: true, force: true });
  fs.rmSync(profileDir, { recursive: true, force: true });
}
