'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = [
  ['agri-weather.html', 'kf-weather', '농업날씨', ['areaChips','regionChips','typeChips','cropSearch','weatherPanel']],
  ['market-prices.html', 'kf-market', '농산물 시세', ['q','searchBtn','chips','typeTabs','status','list','detail']],
  ['crop-calendar.html', 'kf-crop', '재배달력', ['searchInput','cropGrid','detail']],
  ['subsidy-calendar.html', 'kf-subsidy', '정책·지원', ['regionFilter','targetFilter','categoryFilter','programList']],
];

for (const [file, cls, title, ids] of pages) {
  test(file + ' shares identical KFarmAI chrome without removing working widgets', () => {
    const html=read(file);
    assert.ok(html.includes('<body class="v4-page kf-tool-page ' + cls + '">'));
    assert.ok(html.includes('class="brand" href="/index.html" aria-label="KFarmAI 홈">KFarmAI</a>'));
    assert.ok(html.includes('<h1 class="kf-tool-title">' + title + '</h1>'));
    assert.ok(html.includes('/static/css/v4-shell.css?v=20261028-tools1'));
    assert.ok(html.includes('/static/css/v4-tool-pages.css?v=20261028-tools1'));
    assert.ok(html.includes('/static/js/v4-shell.js?v=20261028-tools1'));
    const header=html.match(/<header class="header">([\s\S]*?)<\/header>/);
    assert.ok(header, 'shared header must exist');
    assert.ok(!header[1].includes('<img'), 'no header image logo');
    assert.ok(!header[1].includes('class="home"'), 'no duplicate home button');
    for(const id of ids) assert.ok(html.includes('id="' + id + '"'), id);
    const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    for(const [,attributes,source] of scripts) {
      if(!source.trim()||/type\s*=\s*["']application\/ld\+json/i.test(attributes))continue;
      new vm.Script(source,{filename:file});
    }
  });
}

test('shared CSS prevents rounded tool elements and preserves price tab layout', () => {
  const css=read('static/css/v4-tool-pages.css');
  assert.match(css,/body\.kf-tool-page \.app/);
  assert.match(css,/body\.kf-tool-page \.header \.brand/);
  assert.match(css,/font-size:24px/);
  assert.match(css,/body\.kf-tool-page \.chip\.active/);
  assert.match(css,/body\.kf-market \.tabs \{ display:grid/);
  assert.match(css,/body\.kf-tool-page \.content/);
  assert.ok(!/rgba\([^\n]*gradient\(/.test(css));
});

test('tool pages display full-menu tab as sole active destination', () => {
  const shell=read('static/js/v4-shell.js');
  assert.match(shell,/const toolPages = new Set/);
  for(const [file] of pages) assert.ok(shell.includes("'/" + file + "'"), file);
  assert.match(shell,/if \(active === 'tools'\) menuButton\.setAttribute\('aria-current', 'page'\)/);
});

test('community first paint delays transient loading indicators but retains accessible slow loading status', () => {
  const channel=read('channel.html');
  assert.match(channel,/<main class="list" id="postList" aria-live="polite">/);
  assert.match(channel,/class="loading post-list-pending" role="status"/);
  assert.match(channel,/postListLoadingMarkup/);
  assert.match(channel,/animation:kf-loading-appear 0\.15s ease 0\.45s both/);
  assert.match(channel,/postListRequestId/);
  assert.match(channel,/pendingPostListUpdate/);
  assert.match(channel,/refreshBlockedUsers\(\)/);
  assert.match(channel,/blockedUserIdsSet/);
});
