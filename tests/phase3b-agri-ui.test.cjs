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

const detail = read('agri-info.html');
const index = read('index.html');
const ui = read('static/js/agri-info/agri-feed-ui.js');
const css = read('static/css/agri-info-v3.css');
const audit = read('docs/v3-phase3b-agri-ui-audit.md');

test('V3 agri detail page has a canonical public contract', () => {
  assert.match(detail, /<title>농업정보 - kFarmAI<\/title>/);
  assert.match(detail, /canonical" href="https:\/\/kfarmai\.com\/agri-info\.html"/);
  assert.match(detail, /공공기관과 공식 데이터의 최신 정보를 확인합니다/);
});

test('six-field IA is present', () => {
  for (const label of ['오늘', '날씨·재해', '병해충·농약안전', '농산물 시세', '재배·기술', '지원·공고']) {
    assert.match(detail, new RegExp(label));
  }
});

test('frontend uses only the normalized agri-feed endpoint', () => {
  assert.match(ui, /\/api\/agri-feed/);
  assert.doesNotMatch(ui, /\/api\/(?:weather|kamis|ncpms|psis|nongsaro|mafra|auction)\//);
});

test('Design-1 home and agri tab keep compact summary roots', () => {
  assert.match(index, /id="homeAgriFeed"/);
  assert.match(index, /id="agriTabFeed"/);
  assert.match(index, /id="design1Agriculture"/);
  assert.match(index, /href="agri-info\.html">전체보기/);
  assert.doesNotMatch(index, /id="agriVideoHero"|id="agriResearchList"|id="agriIssueGrid"/);
});

test('status enums map to Korean user-facing labels', () => {
  for (const label of ['최신 자료', '최신 갱신 지연', '이전 기준 자료', '현재 자료 확인 불가']) {
    assert.match(ui, new RegExp(label));
  }
});

test('cards expose data date, source and last-check labels', () => {
  assert.match(ui, /자료 기준:/);
  assert.match(ui, /출처:/);
  assert.match(ui, /마지막 확인:/);
});

test('fallback copy never hides the stored source date', () => {
  assert.match(ui, /기준 저장자료를 표시합니다/);
  assert.match(ui, /현재 최신 데이터를 불러오지 못했습니다/);
});

test('remote provider values are rendered with DOM text nodes', () => {
  assert.doesNotMatch(ui, /\.innerHTML\s*=/);
  assert.match(ui, /textContent = String\(text\)/);
});

test('partial and unavailable state containers are accessible', () => {
  assert.match(detail, /role="status" aria-live="polite"/);
  assert.match(detail, /id="agriFeedLoading"/);
  assert.match(detail, /id="agriFeedMessage"/);
  assert.match(ui, /일부 제공처 자료를 불러오지 못했습니다/);
});

test('responsive CSS covers mobile, tablet and desktop layouts', () => {
  assert.match(css, /@media \(max-width: 340px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
  assert.match(css, /1120px/);
});

test('agri detail local links resolve', () => {
  for (const match of detail.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    const raw = match[1];
    if (/^https?:/i.test(raw)) continue;
    const clean = raw.split('?')[0];
    const target = path.join(root, clean.replace(/^\//, ''));
    assert.equal(fs.existsSync(target), true, raw);
  }
});

test('old video, research and issue modules remain outside the core page', () => {
  assert.doesNotMatch(index, /agri-videos\.js|agri-research-trends\.js|agri-issues\.js|loadAgriInfoContent\(\)/);
  assert.equal(fs.existsSync(path.join(root, 'agri-videos.html')), true);
  assert.equal(fs.existsSync(path.join(root, 'agri-research.html')), true);
  assert.equal(fs.existsSync(path.join(root, 'agri-news.html')), true);
});

test('core agriculture UI has no today/realtime/latest data claims', () => {
  const core = `${detail}\n${ui}`;
  assert.doesNotMatch(core, /실시간 시세|최신 병해충|오늘 날씨/);
});

test('audit classifies every legacy surface without deleting it', () => {
  for (const state of ['KEEP', 'MERGE', 'SIMPLIFY', 'HIDE', 'REMOVE-LATER']) assert.match(audit, new RegExp(`\`${state}\``));
  assert.match(audit, /삭제하지 않음/);
});

test('provider errors are not rendered to users', () => {
  assert.doesNotMatch(ui, /item\?\.errorCode|provider\?\.errorCode|\.stack/);
});

process.stdout.write(`Phase 3B agriculture UI contracts: ${passed}/${passed} PASS\n`);
