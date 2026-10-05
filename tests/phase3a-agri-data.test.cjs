'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
let passed = 0;

function test(name, callback) {
  try {
    callback();
    passed += 1;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

function assertInlineScriptsCompile(relativePath) {
  const html = read(relativePath);
  const scriptPattern = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    if (/application\/ld\+json/i.test(match[1])) continue;
    assert.doesNotThrow(() => new Function(match[2]), `${relativePath} inline script syntax`);
  }
}

test('agri weather inline scripts compile', () => assertInlineScriptsCompile('agri-weather.html'));
test('market prices inline scripts compile', () => assertInlineScriptsCompile('market-prices.html'));
test('public data inline scripts compile', () => assertInlineScriptsCompile('public-data.html'));

const worker = read('worker/src/index.js');
test('agri-feed route exists', () => assert.match(worker, /url\.pathname === '\/api\/agri-feed'/));
test('worker external calls use timeout wrapper', () => {
  assert.doesNotMatch(worker, /await\s+fetch\s*\(/);
  assert.equal((worker.match(/fetchProvider\('/g) || []).length, 9);
});

test('static weather and market fallbacks expose freshness', () => {
  for (const file of ['data/agri_weather.json', 'data/market_prices.json']) {
    const data = JSON.parse(read(file));
    assert.equal(data.fallback, true);
    assert.equal(data.freshness, 'STALE');
    assert.ok(data.dataDate || data.sourceDate);
    assert.ok(data.fetchedAt);
  }
});

test('weather fallback is not labeled as today or realtime', () => {
  const html = read('agri-weather.html');
  assert.doesNotMatch(html, /오늘 날씨요약|실시간 기상 연동/);
  assert.match(html, /기준 저장 자료를 표시하고 있습니다/);
  assert.doesNotMatch(read('index.html'), /오늘의 농업 영상|최신 농업연구동향|오늘의 농업 이슈/);
});

test('KAMIS fallback and trend expose source date or unavailable state', () => {
  assert.match(read('market-prices.html'), /실시간 데이터가 아닙니다/);
  assert.match(worker, /status:\s*PROVIDER_STATUS\.UNAVAILABLE/);
  assert.match(worker, /errorCode:\s*type === 'auction' \? 'auction_endpoint_pending' : 'period_api_pending'/);
});

process.stdout.write(`Phase 3A static contracts: ${passed}/${passed} PASS\n`);
