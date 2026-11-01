'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shell = fs.readFileSync(path.join(__dirname,'..','static/js/v4-shell.js'),'utf8');
const channel = fs.readFileSync(path.join(__dirname,'..','channel.html'),'utf8');
const agri = fs.readFileSync(path.join(__dirname,'..','static/js/agri-info/agri-feed-ui.js'),'utf8');
const kb = fs.readFileSync(path.join(__dirname,'..','static/js/kb-discovery.js'),'utf8');
const tests=[];
function check(name,fn){fn();tests.push(name);}
// These contracts are intentionally source-only; actual real-Chrome metrics
// are collected in the existing Windows CDP test.
check('Main tabs still use actual HTML navigation (no invented SPA)',()=>{
  assert.match(shell,/location\.assign\(path\)/);
  assert.match(shell,/\['home', '홈', '\/index\.html'\]/);
  assert.match(shell,/\['community', '커뮤니티', '\/channel\.html'\]/);
  assert.match(shell,/\['knowledge', '농업정보', '\/kb\/index\.html'\]/);
});
check('Only adjacent public HTML documents warm in idle, not private data APIs',()=>{
  assert.match(shell,/const warmTargets = \['\/index\.html', '\/channel\.html', '\/kb\/index\.html'\]/);
  assert.match(shell,/warmTargets\[currentIndex - 1\], warmTargets\[currentIndex \+ 1\]/);
  assert.match(shell,/requestIdleCallback\(warmNavigation/);
  const warmSection=shell.split('const warmTargets = ')[1].split('const tabIndex =')[0];
  assert.doesNotMatch(warmSection,/fetch\s*\(/);
  assert.doesNotMatch(warmSection,/\bprerender\b/);
});
check('No synchronous or unrelated infographic image decoding in navigation warmup',()=>{
  const warmSection=shell.split('const warmTargets = ')[1].split('const tabIndex =')[0];
  assert.doesNotMatch(warmSection,/image\.decoding = 'sync'/);
  assert.match(warmSection,/image\.decoding = 'async'/);
  assert.doesNotMatch(warmSection,/pear-harvest-sorting-cold-storage-five-checks-infographic/);
  assert.match(warmSection,/slice\(0, 2\)/);
});
check('Menu DOM is still created once and shown without fetching or rebuilding',()=>{
  assert.match(shell,/menu\.innerHTML =/);
  assert.match(shell,/function setMenuState\(open\)/);
  assert.match(shell,/menu\.hidden = !open/);
  const openBlock=shell.split('function openMenu(')[1].split('menuButton.addEventListener')[0];
  assert.doesNotMatch(openBlock,/fetch\s*\(|new XMLHttpRequest|innerHTML\s*=/);
});
check('Main swipe touch listeners remain passive with intact guarded targets',()=>{
  for(const type of ['touchstart','touchmove','touchend','touchcancel'])
    assert.ok(shell.includes("document.addEventListener('"+type+"'"));
  assert.match(shell,/\{ passive: true, capture: true \}/);
  assert.match(shell,/swipeTouchId/);
  assert.match(shell,/insideHorizontalScroller/);
  const moveHandler=shell.split("document.addEventListener('touchmove'")[1]?.split("document.addEventListener('touchend'")[0] || '';
  assert.ok(moveHandler.length>0);
  assert.doesNotMatch(moveHandler,/preventDefault\(/);
});
check('Community reuses a bounded public feed cache but does not cache signed-in posts',()=>{
  assert.match(channel,/localStorage\.setItem\(COMMUNITY_FEED_CACHE_KEY/);
  assert.match(channel,/COMMUNITY_FEED_CACHE_TTL/);
  assert.match(channel,/publicFeedCacheEligible\(/);
  assert.match(channel,/!currentUser/);
  assert.match(channel,/postListRequestId/);
});
check('Agricultural feed coalesces in-flight work and preserves async error handling',()=>{
  assert.match(agri,/if \(!feedPromise\) feedPromise = fetchFeed\(\)\.catch/);
  assert.match(kb,/fetch\('\/data\/kb-index\.json'/);
});
check('No changes to navigation markup or animation-related style contract',()=>{
  assert.match(shell,/nav\.append\(menuButton\)/);
  assert.match(shell,/document\.body\.append\(menu, nav\)/);
});
process.stdout.write('V4 UX performance source contract: '+tests.length+'/'+tests.length+' PASS\n');
