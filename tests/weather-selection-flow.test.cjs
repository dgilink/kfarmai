'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'agri-weather.html'), 'utf8');
const script = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)][0][1];
const weatherRegions = JSON.parse(fs.readFileSync(path.join(root, 'data/weather-regions.json'), 'utf8'));
const weatherProfiles = JSON.parse(fs.readFileSync(path.join(root, 'data/weather-crop-profiles.json'), 'utf8'));
const fallback = JSON.parse(fs.readFileSync(path.join(root, 'data/agri_weather.json'), 'utf8'));

function element() {
  return {
    innerHTML: '', textContent: '', value: '', open: false, href: '', handlers: {},
    addEventListener(name, callback) { this.handlers[name] = callback; },
    querySelectorAll() {
      if (this._html === this.innerHTML) return this._buttons;
      this._html = this.innerHTML;
      this._buttons = [...this.innerHTML.matchAll(/<button[^>]*data-(value|id)="([^"]+)"[^>]*>/g)].map(([, attribute, value]) => ({
        dataset: { [attribute]: value }, handlers: {},
        addEventListener(name, callback) { this.handlers[name] = callback; },
        click() { this.handlers.click(); },
      }));
      return this._buttons;
    },
  };
}

async function run() {
  const elements = new Map();
  const calls = [];
  let weatherFails = false;
  const context = {
    document: { hidden: false, addEventListener() {}, querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    } },
    window: { location: { origin: 'https://kfarmai.com' } },
    URL, Date, console, setInterval() {},
    fetch: async url => {
      const request = String(url);
      calls.push(request);
      if (request.includes('/api/weather/forecast')) {
        assert.equal(new URL(request).origin, 'https://kfarmai.com');
        if (weatherFails) return { ok: false };
        return { ok: true, json: async () => ({
          ok: true, fallback: false, baseDate: '20261029',
          items: { temperature: 12, maxTemp: 20, minTemp: 10, humidity: 75, sky: '흐림' },
        }) };
      }
      const data = request.includes('weather-regions') ? weatherRegions
        : request.includes('weather-crop-profiles') ? weatherProfiles : fallback;
      return { ok: true, json: async () => data };
    },
  };
  vm.runInNewContext(script, context, { filename: 'agri-weather.html' });
  await new Promise(resolve => setImmediate(resolve));

  const get = id => elements.get(id);
  assert.equal(calls.some(url => url.includes('/api/weather/forecast')), false, 'no weather request without a region');
  assert.match(get('#weatherPanel').innerHTML, /권역을 선택하면 최신 날씨가 표시됩니다/);
  assert.match(get('#cropOptionCurrent').textContent, /선택 전/);
  assert.doesNotMatch(get('#areaChips').innerHTML, /class="chip[^\"]*active/);
  assert.doesNotMatch(get('#typeChips').innerHTML, /class="chip[^\"]*active/);
  assert.doesNotMatch(get('#cropList').innerHTML, /class="crop-chip active/);
  assert.equal(get('#summaryPanel').innerHTML, '');
  assert.equal(get('#cropPanel').innerHTML, '');

  get('#areaChips').querySelectorAll()[0].click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.filter(url => url.includes('/api/weather/forecast')).length, 1);
  assert.match(get('#weatherPanel').innerHTML, /업데이트 2026-10-29/);
  assert.doesNotMatch(get('#weatherPanel').innerHTML, /2026-07-02/);

  get('#typeChips').querySelectorAll()[0].click();
  get('#cropList').querySelectorAll()[0].click();
  assert.match(get('#selectedCropSummary').innerHTML, /베란다·실내/);
  assert.notEqual(get('#cropPanel').innerHTML, '');

  weatherFails = true;
  get('#areaChips').querySelectorAll()[1].click();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(get('#weatherPanel').innerHTML, /최신 기상정보를 불러오지 못했습니다/);
  assert.match(get('#weatherPanel').innerHTML, /다시 불러오기/);
  assert.doesNotMatch(get('#weatherPanel').innerHTML, /2026-07-02|12℃/);

  get('#areaChips').querySelectorAll()[1].click();
  assert.match(get('#weatherPanel').innerHTML, /권역을 선택하면 최신 날씨가 표시됩니다/);
  assert.doesNotMatch(get('#weatherPanel').innerHTML, /12℃/);
  console.log('Weather selection flow: 1/1 PASS');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
