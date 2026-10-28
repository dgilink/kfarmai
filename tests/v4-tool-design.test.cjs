'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = [
  ['agri-weather.html', 'kf-weather', '농업날씨', ['areaChips','typeChips','cropSearch','cropOptions','weatherPanel']],
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
    assert.ok(html.includes('/static/css/v4-shell.css?v=20261028-menu1'));
    assert.ok(html.includes('/static/css/v4-tool-pages.css?v=20261029-compact1'));
    assert.ok(html.includes('/static/js/v4-shell.js?v=20261028-menu1'));
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
  assert.match(css,/body\.kf-tool-page \.loading/);
  assert.match(css,/body\.kf-crop \.crop-icon \{ border-radius:0; background:transparent; \}/);
  assert.match(css,/body\.kf-crop #detail \.mini-list/);
  assert.match(css,/body\.kf-crop #detail \.mini:first-child/);
  assert.match(css,/body\.kf-crop #detail \.stage-step-grid \{ grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/body\.kf-tool-page \.content/);
  assert.ok(!/rgba\([^\n]*gradient\(/.test(css));
});

test('agricultural information list leaves search on home and uses topic badges', () => {
  const kb=read('kb/index.html');
  const home=read('index.html');
  const discovery=read('static/js/kb-discovery.js');
  assert.ok(!kb.includes('id="kbSearch"'));
  assert.ok(!kb.includes('id="kbCategory"'));
  assert.ok(!kb.includes('class="kb-controls"'));
  assert.ok(!kb.includes('aria-label="검색"'));
  assert.match(kb,/id="kbTopics" class="kb-topics"/);
  assert.match(kb,/class="kb-topic"/);
  assert.ok(kb.includes('data-category="" aria-pressed="true">전체'));
  assert.ok(home.includes('id="globalSearch"'));
  assert.match(discovery,/search\?\.value/);
  assert.match(discovery,/selectedCategory/);
  assert.match(discovery,/renderTopics/);
  assert.match(discovery,/includes\('재배노하우'\) \? '재배노하우'/);
});

test('global shell provides one fixed text header and routes search to home', () => {
  const shell=read('static/js/v4-shell.js');
  const css=read('static/css/v4-shell.css');
  const channel=read('channel.html');
  const builder=read('scripts/pages/build-pages-artifact.cjs');
  assert.match(shell,/className = 'v4-global-header'/);
  assert.match(shell,/v4-global-brand/);
  assert.match(shell,/\/index\.html\?focus=search/);
  assert.match(shell,/get\('focus'\) === 'search'/);
  assert.match(css,/\.v4-global-header \{[\s\S]*position: fixed/);
  assert.match(css,/font: 900 24px/);
  assert.match(css,/\.v4-legacy-header \{ display: none !important; \}/);
  assert.ok(!channel.includes('id="searchInput"'));
  assert.match(builder,/applyGlobalShellTree\(outputDir\)/);
  assert.match(builder,/data-v4-global-header/);
  assert.match(builder,/addBodyClasses/);
  assert.doesNotMatch(css,/@view-transition/);
  assert.match(shell,/target === document\.documentElement \|\| document\.body\.contains\(target\)/);
});

test('weather and market pages keep only compact user-facing information', () => {
  const weather=read('agri-weather.html');
  const market=read('market-prices.html');
  assert.ok(!weather.includes('id="regionChips"'));
  assert.ok(!weather.includes('id="typeNote"'));
  assert.ok(!weather.includes('id="workPanel"'));
  assert.ok(!weather.includes('id="publicInfoPanel"'));
  assert.match(weather,/<details id="cropOptions" class="crop-options">/);
  assert.match(weather,/class="page-source">출처:/);
  assert.match(weather,/renderAll\(\);try\{/,'weather renders defaults before async data');
  assert.ok(!market.includes('KAMIS 최근 조사자료'));
  assert.ok(!market.includes('많이 확인하는 품목 참고'));
  assert.ok(!market.includes('id="fallbackList"'));
  assert.match(market,/class="page-source">출처:/);
  assert.match(market,/market-updated/);
  assert.match(market,/listItems=fallbackItems\.filter/,'market renders stable local rows before API');
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
  assert.match(channel,/if\(event==='INITIAL_SESSION'\)return/);
  assert.match(channel,/applyChannels\(defaultChannels\(\)\)/);
  assert.match(channel,/const basePosts=visibleFeedPosts\(source\)/);
  assert.match(channel,/renderPosts\(basePosts,totalCount,\{\},requestId,firstPage,category\)/);
  assert.match(channel,/Promise\.all\(\[/);
  assert.match(channel,/updateRenderedPostMeta\(posts,profileMap,requestId\)/);
  assert.match(channel,/COMMUNITY_FEED_CACHE_TTL=5\*60\*1000/);
});

test('home and community share stable first-paint feed cache and prioritize visible media', () => {
  const home=read('index.html');
  const channel=read('channel.html');
  const builder=read('scripts/pages/build-pages-artifact.cjs');
  assert.match(home,/COMMUNITY_FEED_CACHE_KEY = 'kfarmai_public_feed_v2'/);
  assert.match(home,/restoreHomeFeedCache\(feed\)/);
  assert.match(home,/card\.dataset\.postId/);
  assert.match(home,/homeFeedTouchActive/);
  assert.match(home,/pendingHomeFeedUpdates/);
  assert.match(home,/renderHomeFeedPosts\(feed,data,\{\}\)/);
  assert.match(home,/index<2\?'eager':'lazy'/);
  assert.match(home,/fetchpriority="high"/);
  assert.match(channel,/thumbLoading=index<2\?'eager':'lazy'/);
  assert.match(channel,/width="84" height="84"/);
  assert.match(builder,/width="92" height="62"/);
});

test('AI diagnosis uses the compact name and white responsive upload surface', () => {
  const diagnosis=read('diagnosis.html');
  const shell=read('static/js/v4-shell.js');
  const css=read('static/css/v4-detail-pages.css');
  assert.match(diagnosis,/<h1 class="v4-detail-title">AI진단<\/h1>/);
  assert.ok(!diagnosis.includes('<span class="card-hd-txt">AI 참고 진단</span>'));
  assert.match(diagnosis,/class="cam-placeholder-icon"/);
  assert.match(diagnosis,/>사진 촬영<\/button>/);
  assert.match(shell,/\['AI진단', '\/diagnosis\.html'\]/);
  assert.match(css,/\.cam-wrap \{[\s\S]*background: #f7faf8 !important/);
  assert.match(css,/\.card-hd,[\s\S]*display: none !important/);
  assert.match(css,/\.diag-card::after,[\s\S]*\.inner::before,[\s\S]*display: none !important/);
});

const detailPages = [
  ['diagnosis.html', 'v4-diagnosis-page'],
  ['diagnosis-cases.html', 'v4-cases-page'],
  ['public-data.html', 'v4-public-data-page'],
  ['agri_map.html', 'v4-map-page'],
  ['mfg.html', 'v4-mfg-page'],
  ['news_sub.html', 'v4-news-page'],
  ['links.html', 'v4-links-page'],
  ['oauth/privacy/index.html', 'v4-privacy-page'],
];

test('full-menu destinations and their first detail pages use the responsive V4 shell', () => {
  for (const [file, pageClass] of detailPages) {
    const html = read(file);
    assert.ok(html.includes('v4-page v4-detail-page'), file + ' detail page body');
    assert.ok(html.includes(pageClass), file + ' specific body class');
    assert.ok(html.includes('/static/css/v4-shell.css?v=20261028-menu1'), file + ' shell CSS');
    assert.ok(html.includes('/static/css/v4-detail-pages.css?v=20261029-compact2'), file + ' detail CSS');
    assert.ok(html.includes('/static/js/v4-shell.js?v=20261028-menu1'), file + ' shell JS');
    const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    for (const [,attributes,source] of scripts) {
      if (!source.trim() || /\bsrc\s*=/i.test(attributes)
          || /type\s*=\s*["']application\/ld\+json/i.test(attributes)) continue;
      new vm.Script(source,{filename:file});
    }
  }
});

test('detail presentation removes narrow phone frames, grey tails and rounded shells', () => {
  const css = read('static/css/v4-detail-pages.css');
  assert.match(css,/> \.phone,[\s\S]*max-width: none !important/);
  assert.match(css,/footer,[\s\S]*background: #fff !important/);
  assert.match(css,/\.diag-card[\s\S]*width: min\(calc\(100% - 32px\), var\(--kf-detail-width\)\)/);
  assert.match(css,/body\.v4-detail-page > header\.v4-global-header \{[\s\S]*position: fixed/);
  assert.match(css,/\.fixed-map-shell,[\s\S]*var\(--kf-detail-width\)/);
  assert.match(css,/\.v4-privacy-page main[\s\S]*grid-template-columns: repeat\(2/);
  assert.match(css,/@media \(max-width: 767px\)/);
  assert.match(css,/\.match-report-shell \{[\s\S]*background: #fff/);
  assert.match(css,/\.flow-grid \{[\s\S]*display: block/);
});

test('all-menu links are covered by an active full-menu destination', () => {
  const shell = read('static/js/v4-shell.js');
  const menuTargets = [
    '/subsidy-calendar.html', '/diagnosis.html', '/agri-weather.html', '/market-prices.html',
    '/agri_map.html', '/crop-calendar.html', '/oauth/privacy/',
  ];
  for (const target of menuTargets) assert.ok(shell.includes("'" + target + "'"), target);
});
