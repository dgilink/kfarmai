const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const productionPath = path.join(root, 'index.html');
const cssPath = path.join(root, 'static', 'css', 'home-design1.css');
const production = fs.readFileSync(productionPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

function attributeValues(source, name) {
  return [...source.matchAll(new RegExp(`\\b${name}=["']([^"']+)["']`, 'g'))].map((match) => match[1]);
}

function scriptSources(source) {
  return [...source.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/g)].map((match) => match[1]);
}

function metaValue(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `${label} exists`);
  return match[1];
}

test('Design-1 is promoted to the production index and public CSS path', () => {
  assert.ok(fs.existsSync(productionPath));
  assert.ok(fs.existsSync(cssPath));
  assert.doesNotMatch(production, /<base\b/i);
  assert.match(production, /href="static\/css\/home-design1\.css"/);
  assert.doesNotMatch(production, /(?:candidate|preview)\/|localhost|127\.0\.0\.1|[A-Z]:\\Users\\|\/tmp\//i);
});

test('production SEO, analytics, JSON-LD, and script references are preserved', () => {
  assert.equal(metaValue(production, /<title>([^<]+)<\/title>/, 'title'), 'kFarmAI - 농업·식물 AI 참고 진단 커뮤니티');
  assert.match(metaValue(production, /<meta name="description" content="([^"]+)">/, 'description'), /AI 참고 진단/);
  assert.equal(metaValue(production, /<meta name="robots" content="([^"]+)">/, 'robots'), 'index, follow');
  assert.equal(metaValue(production, /<link rel="canonical" href="([^"]+)">/, 'canonical'), 'https://kfarmai.com/');
  assert.equal(metaValue(production, /<meta property="og:url" content="([^"]+)">/, 'OpenGraph URL'), 'https://kfarmai.com/');
  assert.match(metaValue(production, /<meta property="og:title" content="([^"]+)">/, 'OpenGraph title'), /kFarmAI/);
  assert.match(metaValue(production, /<meta name="twitter:title" content="([^"]+)">/, 'Twitter title'), /kFarmAI/);
  assert.deepEqual(scriptSources(production), [
    'https://www.googletagmanager.com/gtag/js?id=G-P6FSHHD8D1',
    'static/js/security/safe-markdown.js',
    'static/js/ai/diagnosis-client.js',
    'static/js/community/community-model.js',
    'static/js/community/question-draft.js',
    'static/pesticide_data.js',
    'static/santo_data.js',
    'static/seed_data.js',
    'static/cpa_data.js',
    'static/fert_data.js',
    'static/crop-pages.js?v=20260706-regional',
    'static/js/agri-info/agri-feed-ui.js',
    'static/js/public-data/diagnosis-report-bridge.js',
  ]);
  assert.equal((production.match(/type="application\/ld\+json"/g) || []).length, 2);
  assert.match(production, /gtag\('config', 'G-P6FSHHD8D1'\)/);
});

test('required DOM IDs are unique and hierarchy-dependent contracts remain', () => {
  const ids = attributeValues(production, 'id');
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  assert.deepEqual(duplicates, []);
  for (const id of [
    'pages', 'searchBox', 'globalSearch', 'searchDropdown', 'channelGrid', 'recentFeed',
    'writeModal', 'headerLoginBtn', 'headerProfile', 'myPanel', 'channelSelect', 'postCategory',
    'postTitle', 'postContent', 'postImages', 'postImagePreview', 'authEmail', 'authOtp',
    'design1Today', 'design1Quick', 'design1Channels', 'design1Latest', 'design1Stories',
    'design1Plants', 'design1Agriculture', 'design1Local', 'greenMarket', 'design1All',
    'design1MenuDialog',
  ]) assert.ok(ids.includes(id), `#${id}`);
  assert.equal((production.match(/class="page(?:\s|\")/g) || []).length, 3);
  assert.equal((production.match(/class="tab(?:\s|\")/g) || []).length, 3);
  assert.equal((production.match(/class="pdot(?:\s|\")/g) || []).length, 3);
  const searchForm = production.match(/<form class="search design1-search"[\s\S]*?<\/form>/)?.[0] || '';
  assert.match(searchForm, /id="globalSearch"/);
  assert.match(searchForm, /id="searchDropdown"/);
  for (const modalId of ['writeModal', 'diagnosisDemoModal', 'accountDeleteModal']) {
    const start = production.indexOf(`id="${modalId}"`);
    assert.ok(start >= 0 && production.slice(start, start + 500).includes('class="modal'), `${modalId} inner modal`);
  }
});

test('locked IA, eight channels, and five actionable mobile navigation items remain', () => {
  const order = [
    'design1Today', 'design1Quick', 'design1Channels', 'design1Latest', 'design1Stories',
    'design1Plants', 'design1Agriculture', 'design1Local', 'greenMarket', 'design1All',
  ];
  let cursor = -1;
  for (const id of order) {
    const index = production.indexOf(`id="${id}"`);
    assert.ok(index > cursor, id);
    cursor = index;
  }
  const channels = production.match(/<nav class="v3-category-grid design1-channel-grid"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.equal((channels.match(/<a /g) || []).length, 8);
  for (const label of ['식물질문', '병해충', '성장기록', '식물자랑', '삽목·분갈이', '나눔·분양', '지역모임', '자유이야기']) assert.ok(channels.includes(label), label);
  const bottom = production.match(/<nav class="design1-bottom-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.equal((bottom.match(/<(?:a|button)\b/g) || []).length, 5);
  for (const label of ['홈', '커뮤니티', '초록장터', '채팅', '전체']) assert.match(bottom, new RegExp(`>${label}<`));
  assert.match(bottom, /초록장터는 준비 중입니다/);
  assert.match(bottom, /채팅 기능은 준비 중입니다/);
  assert.doesNotMatch(bottom, /javascript:void\(0\)/i);
});

test('production visual source keeps the flat Design-1 contract', () => {
  const source = `${production}\n${css}`;
  for (const forbidden of ['linear-gradient', 'radial-gradient', 'backdrop-filter', 'box-shadow']) assert.equal(source.includes(forbidden), false, forbidden);
  const radii = [...source.matchAll(/border-radius\s*:\s*([^;}{]+)/gi)].map((match) => match[1].replace(/!important/gi, '').trim());
  assert.ok(radii.length > 0);
  assert.deepEqual([...new Set(radii)], ['0']);
  assert.doesNotMatch(source, /(?:999px|50%)\s*!?important?/);
  assert.doesNotMatch(production, /AI robot|로봇 일러스트/i);
});

test('real data and explicit empty-state policies are visible without fake market data', () => {
  assert.match(production, /id="recentFeed"/);
  assert.match(production, /등록한 식물이 없습니다/);
  assert.match(production, /초록장터는 준비 중입니다/);
  assert.match(production, /공공자료 기반 참고 콘텐츠/);
  assert.match(production, /AI 참고 진단/);
  assert.doesNotMatch(production, /판매자\s*[:：]\s*\S+|거래거리\s*[:：]|재고\s*[:：]?\s*\d|정확한 진단|최종 진단|추천 농약|이 농약을 쓰세요|전문가 진단/);
  assert.doesNotMatch(production, /(?:placeholder|sample|demo)[-_](?:plant|market|user)|design[-_]?placeholder/i);
});

test('existing handlers and datasets required by production behavior remain', () => {
  for (const contract of [
    'function runSearch', 'function initSearch', 'function loadFeed', 'function renderFeedCard',
    'function openModal', 'function closeModal', 'function safeOpenMyPanel', 'function openMyPanel',
    'function submitPost', 'function handlePostImages', 'data-feed-sort="latest"',
    'data-feed-sort="unanswered"', 'data-feed-sort="helpful"', 'data-i="0"', 'data-i="1"', 'data-i="2"',
  ]) assert.ok(production.includes(contract), contract);
});

test('production CSS enters the Pages artifact while internal paths stay excluded', () => {
  const artifact = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-pages-artifact-i2-'));
  try {
    const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'pages', 'build-pages-artifact.cjs'), `--output=${artifact}`], { cwd: root, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
    const verify = spawnSync(process.execPath, [path.join(root, 'scripts', 'pages', 'verify-pages-artifact.cjs'), artifact], { cwd: root, encoding: 'utf8' });
    assert.equal(verify.status, 0, verify.stderr);
    for (const relative of ['candidate', 'preview', 'tests', 'docs', 'supabase', 'worker']) assert.equal(fs.existsSync(path.join(artifact, relative)), false, relative);
    assert.ok(fs.existsSync(path.join(artifact, 'index.html')));
    assert.ok(fs.existsSync(path.join(artifact, 'static', 'css', 'home-design1.css')));
  } finally {
    fs.rmSync(artifact, { recursive: true, force: true });
  }
});
