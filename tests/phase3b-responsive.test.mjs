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
const port = 18787;
const debugPort = 19223;
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-phase3b-chrome-'));

if (!fs.existsSync(chromePath)) throw new Error('Chrome executable is required for responsive verification');

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
  if (url.pathname === '/api/agri-feed') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(feedFixture()));
    return;
  }
  serveStatic(url.pathname, response);
});

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

let socket;
async function run() {
  try {
    await listen(server, port);
    await waitForDebug();
    const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then(response => response.json());
    socket = new CdpSocket(target.webSocketDebuggerUrl);
    await socket.open();
    await socket.send('Page.enable');
    await socket.send('Runtime.enable');
    await socket.send('Log.enable');

    const fatal = [];
    socket.on('Runtime.exceptionThrown', event => fatal.push(event.params?.exceptionDetails?.text || 'runtime exception'));
    socket.on('Log.entryAdded', event => {
      if (event.params?.entry?.level === 'error') fatal.push(event.params.entry.text || 'console error');
    });

    for (const width of widths) {
      await socket.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width <= 430 });
      const loaded = socket.once('Page.loadEventFired');
      await socket.send('Page.navigate', { url: `http://127.0.0.1:${port}/agri-info.html?width=${width}` });
      await loaded;
      await delay(350);
      const metrics = await evaluate(socket, `(() => {
      const status = [...document.querySelectorAll('.agri-status')].map(el => el.dataset.status);
      const cards = [...document.querySelectorAll('.agri-data-card')];
      const firstGrid = document.querySelector('#weather .agri-card-grid');
      const main = document.querySelector('.agri-v3-main');
      return {
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        summaryCount: document.querySelectorAll('#today .agri-summary-card').length,
        sectionCount: document.querySelectorAll('.agri-v3-section').length,
        statuses: [...new Set(status)],
        cardsHaveSourceAndDate: cards.every(card => /자료 기준:/.test(card.innerText) && /출처:/.test(card.innerText)),
        columns: firstGrid ? getComputedStyle(firstGrid).gridTemplateColumns.split(' ').length : 0,
        mainWidth: main ? Math.round(main.getBoundingClientRect().width) : 0,
        loadingVisible: !document.getElementById('agriFeedLoading')?.hidden
      };
      })()`);
      assert.ok(metrics.scrollWidth <= metrics.innerWidth + 1, `${width}px horizontal overflow`);
      assert.equal(metrics.summaryCount, 4, `${width}px summary cards`);
      assert.equal(metrics.sectionCount, 6, `${width}px IA sections`);
      assert.equal(metrics.cardsHaveSourceAndDate, true, `${width}px metadata`);
      assert.equal(metrics.loadingVisible, false, `${width}px loading completion`);
      assert.deepEqual(metrics.statuses.sort(), ['FALLBACK', 'LIVE', 'STALE', 'UNAVAILABLE']);
      if (width < 768) assert.equal(metrics.columns, 1, `${width}px one-column layout`);
      if (width >= 768 && width < 1024) assert.equal(metrics.columns, 2, `${width}px two-column layout`);
      if (width >= 1024) assert.equal(metrics.columns, 3, `${width}px three-column layout`);
      if (width >= 1024) assert.ok(metrics.mainWidth > 430, `${width}px must not use fixed phone width`);
    }

    assert.deepEqual(fatal, [], `browser fatal errors: ${fatal.join(' | ')}`);
    process.stdout.write(`Phase 3B responsive browser: ${widths.length}/${widths.length} widths PASS\n`);
  } finally {
    try { await socket?.send('Browser.close'); } catch (_) {}
    socket?.close();
    await closeServer(server);
    if (!chrome.killed) chrome.kill();
    await delay(250);
    const tempRoot = path.resolve(os.tmpdir());
    const resolvedProfile = path.resolve(profileDir);
    if (resolvedProfile.startsWith(tempRoot + path.sep) && path.basename(resolvedProfile).startsWith('kfarmai-phase3b-chrome-')) {
      fs.rmSync(resolvedProfile, { recursive: true, force: true });
    }
  }
}

function serveStatic(pathname, response) {
  const relative = decodeURIComponent(pathname === '/' ? '/agri-info.html' : pathname).replace(/^\/+/, '');
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('not found');
    return;
  }
  const extension = path.extname(target).toLowerCase();
  const mime = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' })[extension] || 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(response);
}

function feedFixture() {
  const generatedAt = '2026-10-02T05:30:00.000Z';
  const item = (provider, category, status, title, dataDate, source) => ({
    provider, category, status, title, summary: `${title} 요약`, dataDate, publishedAt: null, fetchedAt: generatedAt,
    source, sourceUrl: 'https://example.com/', freshness: { state: status === 'LIVE' ? 'FRESH' : status, ageHours: status === 'STALE' ? 96 : 1, maxAgeHours: 72, checkedAt: generatedAt },
    isFallback: status === 'FALLBACK', errorCode: status === 'UNAVAILABLE' ? 'fixture_unavailable' : null
  });
  const weather = item('KMA', 'weather', 'LIVE', '서울 단기예보', '2026-10-02', '기상청');
  const pest = item('NCPMS', 'pestDisease', 'LIVE', '고추 병해충 정보', '2026-10-02', 'NCPMS');
  const safety = item('PSIS', 'pesticideSafety', 'FALLBACK', '농약안전사용기준 확인', '2026-09-20', 'PSIS');
  const market = item('KAMIS', 'market', 'STALE', '토마토 공표 시세', '2026-09-28', 'KAMIS');
  const auction = item('AUCTION', 'market', 'UNAVAILABLE', '공영도매시장 경매정보', null, '공영도매시장');
  const cultivation = item('NONGSARO', 'cultivation', 'LIVE', '고추 재배기술', null, '농사로');
  const provider = (key, category, status, source, items = []) => ({ ...item(key.toUpperCase(), category, status, `${source} 자료`, items[0]?.dataDate || null, source), items, notice: '' });
  return {
    generatedAt,
    overallStatus: 'LIVE',
    partial: true,
    sections: { weather: [weather], pestDisease: [pest], pesticideSafety: [safety], market: [market, auction], cultivation: [cultivation], support: [] },
    providers: {
      kma: provider('kma', 'weather', 'LIVE', '기상청', [weather]),
      kamis: provider('kamis', 'market', 'STALE', 'KAMIS', [market]),
      ncpms: provider('ncpms', 'pestDisease', 'LIVE', 'NCPMS', [pest]),
      psis: provider('psis', 'pesticideSafety', 'FALLBACK', 'PSIS', [safety]),
      nongsaro: provider('nongsaro', 'cultivation', 'LIVE', '농사로', [cultivation]),
      mafra: provider('mafra', 'cultivation', 'UNAVAILABLE', 'MAFRA'),
      auction: provider('auction', 'market', 'UNAVAILABLE', '공영도매시장', [auction])
    }
  };
}

function listen(instance, listenPort) {
  return new Promise((resolve, reject) => {
    instance.once('error', reject);
    instance.listen(listenPort, '127.0.0.1', resolve);
  });
}

function closeServer(instance) {
  return new Promise(resolve => instance.close(() => resolve()));
}

async function waitForDebug() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch (_) {}
    await delay(100);
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'browser evaluation failed');
  return result.result.value;
}

class CdpSocket {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  open() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
      this.socket.addEventListener('message', event => this.receive(JSON.parse(event.data)));
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  on(method, callback) {
    const rows = this.listeners.get(method) || [];
    rows.push(callback);
    this.listeners.set(method, rows);
  }

  once(method) {
    return new Promise(resolve => {
      const callback = params => {
        const rows = this.listeners.get(method) || [];
        this.listeners.set(method, rows.filter(item => item !== callback));
        resolve(params);
      };
      this.on(method, callback);
    });
  }

  receive(message) {
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    for (const callback of this.listeners.get(message.method) || []) callback(message);
  }

  close() {
    this.socket?.close();
  }
}

await run();
