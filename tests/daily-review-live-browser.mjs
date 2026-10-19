import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.env.KFARMAI_REVIEW_FIXTURE_URL || '';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-review-browser-'));
let chrome;
let socket;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class CdpSocket {
  constructor(target) { this.target = target; this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  open() { return new Promise((resolve, reject) => { this.ws = new WebSocket(this.target); this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', reject, { once: true }); this.ws.addEventListener('message', (event) => this.receive(JSON.parse(event.data))); }); }
  send(method, params = {}) { const id = ++this.id; const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); this.ws.send(JSON.stringify({ id, method, params })); return result; }
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
  assert.match(url, /^https:\/\/xzetqijeucldbfgjuoes\.supabase\.co\/functions\/v1\/daily-review-approval\?token=[A-Za-z0-9_-]{32,255}$/);
  assert.ok(fs.existsSync(chromePath));
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const target = await waitForDebug();
  socket = new CdpSocket(target.webSocketDebuggerUrl);
  await socket.open();
  await socket.send('Page.enable');
  await socket.send('Runtime.enable');
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
      infographic: document.querySelector('#review-infographic')?.complete && document.querySelector('#review-infographic')?.naturalWidth > 0,
      safety: document.querySelector('#review-safety')?.textContent.includes('공공정보 원문을 대체하지 않습니다'),
      binding: document.querySelector('#review-binding')?.textContent.includes('12164561335') && document.querySelector('#review-binding')?.textContent.includes('9f5da97d'),
      sources: document.querySelectorAll('#review-sources a[href^="https://www.rda.go.kr/"]').length === 2,
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
  assert.equal(value.safety, true);
  assert.equal(value.binding, true);
  assert.equal(value.sources, true);
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
