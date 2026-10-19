import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.env.KFARMAI_REVIEW_FIXTURE_URL || '';
const packageDir = process.env.KFARMAI_REVIEW_PACKAGE_DIR || '';
const expectedArtifact = process.env.KFARMAI_REVIEW_ARTIFACT_ID || '12164561335';
const expectedManifest = process.env.KFARMAI_REVIEW_MANIFEST_SHA256 || '9f5da97da769967a1f68cb95ddb3287288e300d3af347be35d837cdfd0144d30';
const expectedInfographicHeight = Number(process.env.KFARMAI_REVIEW_INFOGRAPHIC_HEIGHT || '845');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-review-browser-'));
let chrome;
let socket;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class CdpSocket {
  constructor(target) { this.target = target; this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  open() { return new Promise((resolve, reject) => { this.ws = new WebSocket(this.target); this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', reject, { once: true }); this.ws.addEventListener('message', (event) => this.receive(JSON.parse(event.data))); }); }
  send(method, params = {}) { const id = ++this.id; const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); this.ws.send(JSON.stringify({ id, method, params })); return result; }
  on(method, callback) { this.listeners.set(method, [...(this.listeners.get(method) || []), callback]); }
  once(method) { return new Promise((resolve) => { const callback = (value) => { this.listeners.set(method, (this.listeners.get(method) || []).filter((item) => item !== callback)); resolve(value); }; this.listeners.set(method, [...(this.listeners.get(method) || []), callback]); }); }
  receive(message) { if (message.id) { const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); return message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); } for (const callback of this.listeners.get(message.method) || []) callback(message.params); }
  close() { this.ws?.close(); }
}

async function waitForDebug() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const file = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(file)) {
      const port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
      const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
      if (response.ok) return response.json();
    }
    await delay(100);
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

try {
  assert.match(url, packageDir
    ? /^https:\/\/kfarmai\.com\/daily-review\.html\?token=[A-Za-z0-9_-]{32,255}$/
    : /^https:\/\/xzetqijeucldbfgjuoes\.supabase\.co\/functions\/v1\/daily-review-approval\?token=[A-Za-z0-9_-]{32,255}$/);
  assert.ok(fs.existsSync(chromePath));
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const target = await waitForDebug();
  socket = new CdpSocket(target.webSocketDebuggerUrl);
  await socket.open();
  await socket.send('Page.enable');
  await socket.send('Runtime.enable');
  if (packageDir) {
    const read = (name) => fs.readFileSync(path.join(packageDir, name));
    const json = (name) => JSON.parse(read(name).toString('utf8'));
    const hash = (name) => createHash('sha256').update(read(name)).digest('hex');
    const article = json('article.json');
    const manifest = json('manifest.json');
    const payload = {
      approval_id: manifest.approval_id, approval_type: 'CONTENT', content_state: 'PENDING', publish_state: 'PENDING',
      artifact_id: Number(expectedArtifact), manifest_sha256: expectedManifest, state: 'PENDING', expires_at: '2026-10-22T10:20:36Z',
      article, review: json('review.json'), source_check: json('source-check.json'), usage: json('source-check.json').cost_evidence.usage,
      article_sha256: hash('article.json'), html_sha256: hash(`publish/kb/${article.slug}.html`),
      hero_sha256: hash(`publish/static/kb/${article.slug}-hero.webp`), infographic_sha256: hash(`publish/static/kb/${article.slug}-infographic.svg`),
      review_url: 'https://github.com/dgilink/kfarmai/issues/5', published: false, csrf: 'fixture-csrf', action: 'CONTENT_APPROVE',
      review_endpoint: 'https://xzetqijeucldbfgjuoes.supabase.co/functions/v1/daily-review-approval',
      hero_url: 'https://xzetqijeucldbfgjuoes.supabase.co/functions/v1/daily-review-approval?asset=hero',
      infographic_url: 'https://xzetqijeucldbfgjuoes.supabase.co/functions/v1/daily-review-approval?asset=infographic'
    };
    const response = (requestId, contentType, body) => socket.send('Fetch.fulfillRequest', {
      requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Access-Control-Allow-Origin', value: 'https://kfarmai.com' }, { name: 'Access-Control-Allow-Credentials', value: 'true' }],
      body: Buffer.from(body).toString('base64')
    });
    socket.on('Fetch.requestPaused', ({ requestId, request }) => {
      const target = new URL(request.url);
      if (target.searchParams.get('format') === 'json') return response(requestId, 'application/json; charset=UTF-8', JSON.stringify(payload));
      if (target.searchParams.get('asset') === 'hero') return response(requestId, 'image/webp', read(`publish/static/kb/${article.slug}-hero.webp`));
      if (target.searchParams.get('asset') === 'infographic') return response(requestId, 'image/svg+xml; charset=UTF-8', read(`publish/static/kb/${article.slug}-infographic.svg`));
      return socket.send('Fetch.continueRequest', { requestId });
    });
    await socket.send('Fetch.enable', { patterns: [{ urlPattern: 'https://xzetqijeucldbfgjuoes.supabase.co/*' }] });
  }
  if (process.env.KFARMAI_REVIEW_VIEWPORT === 'mobile') {
    await socket.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  } else {
    await socket.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  }
  const loaded = socket.once('Page.loadEventFired');
  await socket.send('Page.navigate', { url });
  await loaded;
  let result;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    result = await socket.send('Runtime.evaluate', { returnByValue: true, expression: `({
      host: location.host,
      title: document.querySelector('#review-title')?.textContent || '',
      summary: document.querySelector('#review-summary')?.textContent || '',
      korean: document.body.innerText.includes('공식 출처') && document.body.innerText.includes('실제 AI usage·비용'),
      usage: document.querySelector('#review-usage')?.textContent.includes('1243') && document.querySelector('#review-usage')?.textContent.includes('1064'),
      reasoning: document.querySelector('#review-usage')?.textContent.includes('335'),
      fullArticle: document.querySelectorAll('#review-sections h3').length >= 4 && document.body.innerText.includes('난방기 관리'),
      hero: document.querySelector('#review-hero')?.complete && document.querySelector('#review-hero')?.naturalWidth > 0,
      infographic: document.querySelector('#review-infographic')?.complete && document.querySelector('#review-infographic')?.naturalWidth === 1200 && document.querySelector('#review-infographic')?.naturalHeight === ${expectedInfographicHeight},
      infographicLayout: (() => { const image=document.querySelector('#review-infographic'); const box=image?.getBoundingClientRect(); return !!box && box.width > 300 && box.height > 200 && box.right <= document.documentElement.clientWidth + 1; })(),
      safety: document.querySelector('#review-safety')?.textContent.includes('제조사 설명서') && !document.querySelector('#review-safety')?.textContent.includes('농약 사용 전'),
      binding: document.querySelector('#review-binding')?.textContent.includes(${JSON.stringify(expectedArtifact)}) && document.querySelector('#review-binding')?.textContent.includes(${JSON.stringify(expectedManifest.slice(0, 8))}),
      sources: document.querySelectorAll('#review-sources a[href^="https://www.rda.go.kr/"]').length === 2,
      separated: document.querySelector('#public-preview-heading')?.textContent === '게시 예정 화면' && document.querySelector('#internal-review-heading')?.textContent === '내부 검수 정보',
      states: document.querySelector('#review-binding')?.textContent.includes('CONTENT 상태: PENDING') && document.querySelector('#review-binding')?.textContent.includes('PUBLISH 상태: PENDING'),
      button: document.querySelector('#review-button')?.textContent === '콘텐츠 검수 승인' && !document.querySelector('#review-button')?.disabled,
      raw: document.body.innerText.includes('<!doctype html>'),
      error: !document.querySelector('#review-error')?.hidden
    })` });
    if (result.result.value?.button || result.result.value?.error) break;
    await delay(200);
  }
  const value = result.result.value;
  assert.equal(value.host, 'kfarmai.com');
  assert.equal(value.title, '겨울철 온실 난방 전 틈새·난방기·배관 확인 포인트');
  assert.match(value.summary, /겨울철 온실 난방 전 배관 누수/);
  assert.equal(value.korean, true);
  assert.equal(value.usage, true);
  assert.equal(value.reasoning, true);
  assert.equal(value.fullArticle, true);
  assert.equal(value.hero, true);
  assert.equal(value.infographic, true);
  assert.equal(value.infographicLayout, true);
  assert.equal(value.safety, true);
  assert.equal(value.binding, true);
  assert.equal(value.sources, true);
  assert.equal(value.separated, true);
  assert.equal(value.states, true);
  assert.equal(value.button, true);
  assert.equal(value.raw, false);
  assert.equal(value.error, false);
  process.stdout.write('Daily REVIEW live browser: full UTF-8 article, Hero and Infographic rendered; CONTENT button active.\n');
} finally {
  try { await socket?.send('Browser.close'); } catch {}
  socket?.close();
  if (chrome?.exitCode === null) chrome.kill();
  await delay(300);
  const resolved = path.resolve(profile);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
