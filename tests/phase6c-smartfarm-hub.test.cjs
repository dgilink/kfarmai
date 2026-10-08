'use strict';

const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const hubPath = 'kb/smartfarm-guide.html';
const detailPaths = [
  'kb/smartfarm-environment-sensors.html',
  'kb/smartfarm-irrigation-fertigation.html',
  'kb/smartfarm-environment-control-automation.html',
  'kb/smartfarm-energy-management.html',
];
const hub = read(hubPath);
const details = detailPaths.map(read);
const taxonomy = JSON.parse(read('data/agri-input-taxonomy.json'));
const registry = JSON.parse(read('data/agri-official-sources.json'));
const smart = taxonomy.canonicalCategories.find((category) => category.id === 'smart-agriculture');
const smartfarm = smart.children.find((area) => area.id === 'smartfarm');
const aquafarm = smart.children.find((area) => area.id === 'land-aquafarm');
const sitemap = read('sitemap.xml');
const mfg = read('mfg.html');
const agriInfo = read('agri-info.html');
const workflow = read('.github/workflows/pages.yml');
const css = read('static/css/knowledge-v3.css');
const sourceIds = (hub.match(/data-official-source-ids="([^"]+)"/)?.[1] || '').split(',').filter(Boolean);
const artifact = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-pages-artifact-phase6c-'));
let passed = 0;
function test(name, check) {
  try { check(); passed += 1; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
function run(script, args = []) {
  return cp.spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, encoding: 'utf8' });
}
function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map((match) => JSON.parse(match[1]));
}

try {
  test('hub exists at the selected KB slug', () => assert.ok(fs.existsSync(path.join(root, hubPath))));
  test('hub has unique title and substantive description', () => {
    const title = hub.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = hub.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.match(title, /스마트팜 가이드/);
    assert.ok(description.length > 50);
    details.forEach((page) => assert.notEqual(title, page.match(/<title>([^<]+)<\/title>/)?.[1]));
  });
  test('hub canonical and OpenGraph use its production URL', () => {
    const url = `https://kfarmai.com/${hubPath}`;
    assert.match(hub, new RegExp(`<link rel="canonical" href="${url}">`));
    assert.match(hub, /<meta property="og:title" content="[^"]+">/);
    assert.match(hub, /<meta property="og:description" content="[^"]+">/);
    assert.ok(hub.includes(`<meta property="og:url" content="${url}">`));
    assert.doesNotMatch(hub, /localhost|127\.0\.0\.1/);
  });
  test('one H1 and logical heading hierarchy', () => {
    const levels = [...hub.matchAll(/<h([1-3])\b/g)].map((match) => Number(match[1]));
    assert.equal(levels.filter((level) => level === 1).length, 1);
    for (let index = 1; index < levels.length; index += 1) assert.ok(levels[index] - levels[index - 1] <= 1);
  });
  test('approved favicon and existing layout are reused', () => {
    assert.match(hub, /<link rel="icon" href="\/static\/kfarmai-logo-horizontal\.png">/);
    assert.match(hub, /\/static\/css\/knowledge-v3\.css/);
    assert.match(css, /a:focus-visible/);
  });
  test('visible breadcrumb ends at smartfarm', () => {
    assert.match(hub, /<nav class="breadcrumb" aria-label="현재 위치">/);
    assert.match(hub, /<span aria-current="page">스마트팜<\/span>/);
  });
  test('CollectionPage describes the real hub', () => {
    const page = jsonLd(hub).find((item) => item['@type'] === 'CollectionPage');
    assert.ok(page);
    assert.equal(page.url, `https://kfarmai.com/${hubPath}`);
    assert.equal(page.publisher.name, 'kFarmAI');
  });
  test('ItemList matches the four visible specialist pages in order', () => {
    const list = jsonLd(hub).find((item) => item['@type'] === 'ItemList');
    assert.deepEqual(list.itemListElement.map((item) => item.url), detailPaths.map((file) => `https://kfarmai.com/${file}`));
    assert.deepEqual(list.itemListElement.map((item) => item.position), [1, 2, 3, 4]);
    detailPaths.forEach((file) => assert.ok(hub.includes(`href="/${file}"`)));
  });
  test('BreadcrumbList maps to visible navigation', () => {
    const list = jsonLd(hub).find((item) => item['@type'] === 'BreadcrumbList');
    assert.deepEqual(list.itemListElement.map((item) => item.name), ['홈', '스마트농업', '스마트팜']);
  });
  test('hub explains the four distinct roles', () => {
    for (const term of ['환경센서 · 측정', '관수·양액 · 공급', '환경제어·자동화 · 제어', '에너지관리 · 운영']) assert.ok(hub.includes(term), term);
  });
  test('hub explains measurement through rechecking', () => {
    for (const term of ['측정', '데이터 확인', '판단', '공급·환경제어', '자동화 운전', '에너지 사용 확인', '결과 재확인']) assert.ok(hub.includes(term), term);
  });
  test('automation requires human observation and manual intervention', () => {
    for (const term of ['현장 관찰', '통신 장애', '수동 전환', '현장 점검']) assert.ok(hub.includes(term), term);
  });
  test('smartfarm and aquafarm are described in distinct contexts', () => {
    for (const term of ['작물', '온실', '시설재배', '육상 아쿠아팜', '순환여과', '수처리']) assert.ok(hub.includes(term), term);
  });
  test('all four specialist pages link back through their breadcrumbs', () => details.forEach((page) => {
    assert.match(page, /<nav class="breadcrumb"[^>]*>[\s\S]*?<a href="\/kb\/smartfarm-guide\.html">스마트팜<\/a>/);
    const breadcrumb = jsonLd(page).find((item) => item['@type'] === 'BreadcrumbList');
    assert.equal(breadcrumb.itemListElement[2].item, `https://kfarmai.com/${hubPath}`);
  }));
  test('all four specialist pages retain direct hub links', () => details.forEach((page) => assert.match(page, /href="\/kb\/smartfarm-guide\.html">스마트팜 전체 가이드/)));
  test('taxonomy defines a landing URL without changing existing specialist order', () => {
    assert.equal(smartfarm.landingUrl, hubPath);
    assert.deepEqual(smartfarm.contentLinks.map((item) => item.url), detailPaths);
  });
  test('mfg fallback and renderer expose hub before specialist links', () => {
    assert.match(mfg, /landingUrl: 'kb\/smartfarm-guide\.html'/);
    assert.match(mfg, /스마트팜 전체 가이드 보기/);
    assert.match(mfg, /active\.landingUrl[\s\S]*스마트팜 가이드에서 먼저 살펴보기/);
    detailPaths.forEach((file) => assert.ok(mfg.includes(file)));
  });
  test('agri-info offers a static hub link without changing feed API', () => {
    assert.match(agriInfo, /href="\/kb\/smartfarm-guide\.html">스마트팜 가이드 보기/);
    assert.match(agriInfo, /static\/js\/agri-info\/agri-feed-ui\.js/);
  });
  test('existing smartfarm metadata and official source sections remain', () => details.forEach((page) => {
    assert.match(page, /<link rel="canonical" href="https:\/\/kfarmai\.com\//);
    assert.match(page, /"@type":"Article"/);
    assert.match(page, /data-official-source-ids="[^"]+"/);
    assert.match(page, /<link rel="icon"/);
  }));
  test('hub sources exist and retain needs-review licenses', () => {
    assert.equal(sourceIds.length, 5);
    sourceIds.forEach((id) => {
      const source = registry.sources.find((item) => item.id === id);
      assert.ok(source, id);
      assert.equal(source.license.status, 'needs-review');
    });
    assert.equal(registry.sources.length, 11);
  });
  test('hub explains rather than copying official text', () => assert.match(hub, /공식기관 원문을 대량 복제하지 않았고/));
  test('hub contains no unsupported quantitative prescription or promotion', () => {
    assert.doesNotMatch(hub, /\d+(?:\.\d+)?\s*(?:°C|도|ppm|%|kWh|원|개월|년|배|리터|L\b)/i);
    assert.doesNotMatch(hub, /구매하기|가격비교|장바구니|결제|업체 순위|추천 제품/);
  });
  test('sitemap includes the hub once and keeps a valid public URL set', () => {
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert.equal(urls.filter((url) => url === `https://kfarmai.com/${hubPath}`).length, 1);
    assert.ok(urls.length >= 180);
    assert.equal(new Set(urls).size, urls.length);
    urls.forEach((url) => assert.match(url, /^https:\/\/kfarmai\.com\//));
    assert.doesNotMatch(sitemap, /(?:preview|candidate|private|draft|localhost|127\.0\.0\.1|noindex|\/orp)/i);
  });
  test('ORP remains supplementary and held', () => {
    assert.equal(aquafarm.topicPolicies.ORP.evidenceLevel, 'supplementary');
    assert.equal(aquafarm.topicPolicies.ORP.seoEligibility, 'hold');
  });
  test('local hub links resolve to real public files', () => {
    for (const match of hub.matchAll(/href="(\/[^"?#]+)[^\"]*"/g)) {
      const relative = match[1] === '/' ? 'index.html' : match[1].slice(1);
      const target = relative.endsWith('/') ? `${relative}index.html` : relative;
      assert.ok(fs.existsSync(path.join(root, target)), target);
    }
  });
  const build = run('scripts/pages/build-pages-artifact.cjs', [`--output=${artifact}`]);
  test('public allowlist builder includes the hub', () => {
    assert.equal(build.status, 0, build.stderr);
    assert.ok(fs.existsSync(path.join(artifact, hubPath)));
  });
  const verify = run('scripts/pages/verify-pages-artifact.cjs', [artifact]);
  test('artifact guard checks the current sitemap URL set and local references', () => {
    assert.equal(verify.status, 0, verify.stderr);
    assert.match(verify.stdout, /\b\d+ sitemap URLs\b/);
  });
  test('no internal development path enters the artifact', () => {
    for (const file of ['supabase', 'worker', 'tests', 'docs', '.github', '.env', 'AGENTS.md', 'package.json']) assert.ok(!fs.existsSync(path.join(artifact, file)), file);
  });
  test('workflow keeps the existing allowlist builder and fail-fast guard', () => {
    assert.match(workflow, /build-pages-artifact\.cjs/);
    assert.match(workflow, /verify-pages-artifact\.cjs/);
  });
  console.log(`Phase 6C smartfarm hub contracts: ${passed}/${passed} PASS`);
} finally {
  fs.rmSync(artifact, { recursive: true, force: true });
}
