import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-pages-artifact-v4-mobile-'));
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-v4-mobile-'));
const widths = [320, 360, 390, 412, 430];
const routes = ['/index.html', '/channel.html', '/kb/index.html'];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let port = 0;
let debugPort = 0;
let chrome;
let socket;

function resolveRequest(rawUrl) {
  const url = new URL(rawUrl, `http://127.0.0.1:${port}`);
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  return target;
}

const server = http.createServer((request, response) => {
  const target = resolveRequest(request.url || '/');
  if (!target) { response.writeHead(404); response.end('not found'); return; }
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[path.extname(target).toLowerCase()] || 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(response);
});

class CdpSocket {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  open() { return new Promise((resolve, reject) => { this.socket = new WebSocket(this.url); this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); this.socket.addEventListener('message', event => this.receive(JSON.parse(event.data))); }); }
  send(method, params = {}) { const id = ++this.id; const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); this.socket.send(JSON.stringify({ id, method, params })); return promise; }
  on(method, callback) { this.listeners.set(method, [...(this.listeners.get(method) || []), callback]); }
  once(method) { return new Promise(resolve => { const callback = params => { this.listeners.set(method, (this.listeners.get(method) || []).filter(item => item !== callback)); resolve(params); }; this.on(method, callback); }); }
  receive(message) { if (message.id) { const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); return; } for (const callback of this.listeners.get(message.method) || []) callback(message.params); }
  close() { this.socket?.close(); }
}

async function evaluate(expression) {
  const result = await socket.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function navigate(route) {
  const loaded = socket.once('Page.loadEventFired');
  await socket.send('Page.navigate', { url: `http://127.0.0.1:${port}${route}` });
  await loaded;
  await delay(350);
  assert.equal(await evaluate("document.readyState"), 'complete', route);
  assert.equal(await evaluate("document.querySelectorAll('.v4-nav').length"), 1, `${route} single nav`);
}

async function touchSwipe(selector, direction = 'down') {
  const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:${selector === 'body' ? 'Math.max(8,r.left+8)' : 'r.left+r.width/2'},y1:${selector === 'body' ? 'innerHeight-90' : 'Math.min(innerHeight-90,r.bottom-40)'},y2:${selector === 'body' ? '90' : 'Math.max(90,r.top+40)'}}; })()`);
  const fromY = direction === 'down' ? point.y1 : point.y2;
  const toY = direction === 'down' ? point.y2 : point.y1;
  await socket.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: fromY, radiusX: 2, radiusY: 2, force: 1 }] });
  for (let step = 1; step <= 8; step += 1) {
    const y = fromY + (toY - fromY) * step / 8;
    await socket.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y, radiusX: 2, radiusY: 2, force: 1 }] });
    await delay(20);
  }
  await socket.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await delay(140);
}

async function contentSwipeAt(scrollFraction, direction, expectNavigation = false) {
  const point = await evaluate(`(() => {
    const scroller=v4AllMenu.hidden?document.scrollingElement:v4AllMenu;
    scroller.scrollTop=Math.max(0,(scroller.scrollHeight-scroller.clientHeight)*${scrollFraction});
    const left=${JSON.stringify(direction)}==='left';
    return {x:left?innerWidth*.72:innerWidth*.28,y:innerHeight*.5,width:innerWidth,target:''};
  })()`);
  await delay(180);
  const distance = Math.min(110, point.width - 90);
  const x2 = direction === 'left' ? point.x - distance : point.x + distance;
  await evaluate(`window.__swipeTrace=[]; if(!window.__swipeTraceInstalled){window.__swipeTraceInstalled=true; for(const type of ['touchstart','touchmove','touchend','touchcancel']) document.addEventListener(type,event=>window.__swipeTrace.push({type,x:event.touches[0]?.clientX??null,y:event.touches[0]?.clientY??null,target:event.target.tagName+'.'+event.target.className}),{capture:true,passive:true});}`);
  const loaded = expectNavigation ? socket.once('Page.loadEventFired') : null;
  await socket.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:point.x,y:point.y,radiusX:2,radiusY:2,force:1}] });
  for (let step=1;step<=10;step+=1) {
    await socket.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:point.x+(x2-point.x)*step/10,y:point.y+(step%2),radiusX:2,radiusY:2,force:1}] });
    await delay(25);
  }
  await socket.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  if (loaded) await Promise.race([loaded, delay(4000).then(async () => {
    const debug=await evaluate(`({path:location.pathname,trace:window.__swipeTrace,start:document.elementFromPoint(${point.x},${point.y})?.outerHTML.slice(0,180)})`);
    throw new Error(`content swipe ${direction} at ${scrollFraction} did not navigate: ${JSON.stringify(debug)}`);
  })]);
  await delay(300);
}

async function assertSingleVisualActive(label, menuOpen = false) {
  const state = await evaluate(`(() => ({
    semantic: document.querySelectorAll('.v4-nav [aria-current="page"]').length,
    visual: [...document.querySelectorAll('.v4-nav>a,.v4-nav>button')].filter(element => {
      const style=getComputedStyle(element);
      return parseFloat(style.borderTopWidth)>=3 && style.color==='rgb(18, 108, 67)';
    }).length,
    expanded: document.querySelectorAll('.v4-nav [aria-expanded="true"]').length
  }))()`);
  assert.equal(state.semantic, 1, `${label} aria-current retained`);
  assert.equal(state.visual, 1, `${label} one computed visual active`);
  assert.equal(state.expanded, menuOpen ? 1 : 0, `${label} expanded state`);
}

async function ignoredHorizontalSwipe(selector) {
  const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.min(innerWidth-45,Math.max(115,r.left+r.width*.7)),y:Math.min(innerHeight-90,Math.max(90,r.top+r.height/2))}})()`);
  await socket.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:point.x,y:point.y,radiusX:2,radiusY:2,force:1}] });
  for (let step=1;step<=8;step+=1) {
    await socket.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:point.x-75*step/8,y:point.y,radiusX:2,radiusY:2,force:1}] });
    await delay(20);
  }
  await socket.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await delay(300);
}

async function swipeWhileCommunityRenders() {
  const point = await evaluate(`(() => {
    offset=0;
    const list=document.getElementById('postList');
    list.innerHTML='<div class="loading">Loading posts</div>';
    const loading=list.querySelector('.loading');
    loading.scrollIntoView({block:'center'});
    const rect=loading.getBoundingClientRect();
    window.__loadingTouchTarget=loading;
    return {x:Math.max(45,Math.min(innerWidth-130,rect.left+rect.width/2)),y:rect.top+rect.height/2};
  })()`);
  assert.equal(await evaluate(`document.elementFromPoint(${point.x},${point.y})?.closest('.loading')===window.__loadingTouchTarget`), true, 'touch begins on community loading row');
  const loaded = socket.once('Page.loadEventFired');
  await socket.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:point.x,y:point.y,radiusX:2,radiusY:2,force:1}] });
  await evaluate('renderPosts([],0,{})');
  assert.equal(await evaluate('window.__loadingTouchTarget.isConnected'), true, 'async post render keeps active touch target connected');
  for (let step=1;step<=10;step+=1) {
    await socket.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:point.x+110*step/10,y:point.y,radiusX:2,radiusY:2,force:1}] });
    await delay(20);
  }
  await socket.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await Promise.race([loaded,delay(4000).then(()=>{throw new Error('community loading swipe did not navigate home');})]);
  assert.equal(await evaluate('location.pathname'), '/index.html', 'community loading swipe navigates home');
}

async function communityRequestRaces() {
  await navigate('/channel.html');
  await evaluate(`(() => {
    window.__realSb=sb;
    window.__queries=[];
    sb={from:()=>{
      const query={filters:[],eq(...args){this.filters.push(args);return this},not(){return this},or(value){this.filters.push(value);return this},order(){return this},range(){return this},select(){return this},then(resolve){this.resolve=resolve;window.__queries.push(this)}};
      return query;
    }};
    attachCommentCounts=async posts=>posts;
    fetchProfileMap=async()=>({});
    window.__post=(title)=>({id:title,title,content:'test',created_at:'2026-10-01',user_id:null});
    window.__reply=(index,title)=>window.__queries[index].resolve({data:[window.__post(title)],count:1,error:null});
    resetAndLoad();
  })()`);
  assert.equal(await evaluate('window.__queries.length'), 1, 'initial request started');
  await evaluate(`document.getElementById('searchInput').value='first';applyKeywordSearch();document.getElementById('searchInput').value='second';applyKeywordSearch()`);
  assert.equal(await evaluate('window.__queries.length'), 3, 'each search starts despite an older load');
  assert.match(await evaluate('window.__queries[2].filters[0]'), /second/, 'latest query uses latest keyword');
  await evaluate(`window.__reply(2,'second result')`);
  await delay(50);
  await evaluate(`window.__reply(0,'old result');window.__reply(1,'first result')`);
  await delay(50);
  assert.deepEqual(await evaluate(`({titles:[...document.getElementById('postList').querySelectorAll('.post-title')].map(e=>e.textContent),loading:isLoading,count:document.getElementById('resultCount').textContent})`),
    {titles:['second result'],loading:false,count:'1개'}, 'late responses cannot replace the latest search');
  await evaluate(`currentChannel={id:'category-test',name:'질문',slug:'question-help'};resetAndLoad()`);
  assert.deepEqual(await evaluate('window.__queries[3].filters[0]'),['category_id','category-test'],'channel filter uses the latest category');
  await evaluate(`window.__reply(3,'filtered result')`);
  await delay(50);
  assert.deepEqual(await evaluate("[...document.getElementById('postList').querySelectorAll('.post-title')].map(e=>e.textContent)"),['filtered result'],'filter result replaces previous search');

  await socket.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const point=await evaluate(`(() => {offset=0;const list=document.getElementById('postList');list.innerHTML='<div class="loading">Loading</div>';const r=list.querySelector('.loading').getBoundingClientRect();return{x:Math.max(45,Math.min(innerWidth-45,r.left+r.width/2)),y:r.top+r.height/2}})()`);
  const touch={x:point.x,y:point.y,radiusX:2,radiusY:2,force:1};
  await socket.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
  await evaluate(`renderPosts([window.__post('stale render')],1,{});renderPosts([window.__post('latest render')],1,{})`);
  assert.equal(await evaluate("document.getElementById('postList').querySelector('.loading')?.isConnected"),true,'active touch target survives queued renders');
  await socket.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touch,y:touch.y+60}]});
  await socket.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.deepEqual(await evaluate("[...document.getElementById('postList').querySelectorAll('.post-title')].map(e=>e.textContent)"),['latest render'],'only latest queued render flushes');
  assert.equal(await evaluate('pendingPostListUpdate===null'),true,'pending render is cleared');

  await socket.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
  await evaluate(`renderPosts([window.__post('cancelled touch')],1,{})`);
  await socket.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert.equal(await evaluate("document.getElementById('postList').querySelector('.post-title')?.textContent"),'cancelled touch','touchcancel releases pending render');
  await socket.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
  await socket.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch,{...touch,x:touch.x+20,y:touch.y+20}]});
  await evaluate(`renderPosts([window.__post('multitouch')],1,{})`);
  await socket.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await evaluate("document.getElementById('postList').querySelector('.post-title')?.textContent"),'multitouch','multitouch eventually releases render');
  await socket.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
  await evaluate(`renderPosts([window.__post('page exit')],1,{});window.dispatchEvent(new Event('pagehide'))`);
  assert.equal(await evaluate("document.getElementById('postList').querySelector('.post-title')?.textContent"),'page exit','pagehide releases pending render');
  assert.equal(await evaluate('postListTouches'),0,'pagehide clears touch state');
  await socket.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await socket.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const clicked=socket.once('Page.loadEventFired');
  await evaluate("document.getElementById('postList').querySelector('.post-card').click()");
  await clicked;
  assert.equal(await evaluate('location.pathname'),'/post.html','post link still navigates after touch recovery');
  await navigate('/channel.html');
}

try {
  assert.ok(fs.existsSync(chromePath), 'Chrome is required');
  const build = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/pages/build-pages-artifact.cjs'), `--output=${root}`], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const portFile = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(portFile)) { debugPort = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]); break; }
    await delay(100);
  }
  assert.ok(debugPort, `Chrome debugging is available (exit=${chrome.exitCode}, signal=${chrome.signalCode})`);
  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then(response => response.json());
  socket = new CdpSocket(target.webSocketDebuggerUrl);
  await socket.open();
  await socket.send('Page.enable'); await socket.send('Runtime.enable'); await socket.send('Network.enable');
  const fatal = [];
  socket.on('Runtime.exceptionThrown', event => fatal.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || 'exception'));

  for (const width of widths) {
    await socket.send('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: 720 });
    await socket.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    for (const route of routes) {
      await navigate(route);
      const initial = await evaluate(`(() => ({
        xOverflow: document.documentElement.scrollWidth - innerWidth,
        navs: document.querySelectorAll('.v4-nav').length,
        menus: document.querySelectorAll('#v4AllMenu').length,
        active: document.querySelectorAll('.v4-nav:not(.is-menu-open) [aria-current="page"]').length,
        scrollHeight: document.scrollingElement.scrollHeight,
        clientHeight: document.scrollingElement.clientHeight,
        phoneOverflow: document.querySelector('.phone') ? getComputedStyle(document.querySelector('.phone')).overflowY : null,
        touchAction: getComputedStyle(document.scrollingElement).touchAction,
      }))()`);
      assert.ok(initial.xOverflow <= 1, `${route} ${width}px horizontal overflow`);
      assert.equal(initial.navs, 1, `${route} ${width}px single nav`);
      assert.equal(initial.menus, 1, `${route} ${width}px single menu`);
      assert.equal(initial.active, 1, `${route} ${width}px one page tab active`);
      assert.ok(initial.scrollHeight > initial.clientHeight, `${route} ${width}px has vertical content`);
      if (route === '/index.html') assert.equal(initial.phoneOverflow, 'visible', `${route} ${width}px unclipped phone`);

      await evaluate('scrollTo(0,0)');
      await touchSwipe('body', 'down');
      assert.ok(await evaluate('scrollY > 0'), `${route} ${width}px touch scroll to middle`);
      for (let attempt=0;attempt<12 && !await evaluate('scrollY+innerHeight>=document.scrollingElement.scrollHeight-2');attempt+=1) await touchSwipe('body','down');
      const bottom = await evaluate(`(() => { const nav=document.querySelector('.v4-nav').getBoundingClientRect(); return {atBottom:scrollY+innerHeight>=document.scrollingElement.scrollHeight-2,y:scrollY,height:document.scrollingElement.scrollHeight,navTop:nav.top,viewport:innerHeight}; })()`);
      assert.ok(bottom.atBottom, `${route} ${width}px touch reaches last content ${JSON.stringify(bottom)}`);
      for (let attempt=0;attempt<12 && await evaluate('scrollY>1');attempt+=1) await touchSwipe('body','up');
      assert.ok(await evaluate('scrollY<=1'), `${route} ${width}px touch returns to top`);
      await evaluate('scrollTo(0,120)');
      const savedY = await evaluate('scrollY');

      await evaluate("document.body.style.setProperty('overflow','auto'); document.querySelector('.v4-nav button').click()");
      const opened = await evaluate(`(() => ({
        active: document.querySelectorAll('.v4-nav.is-menu-open [aria-expanded="true"]').length,
        semanticCurrent: document.querySelectorAll('.v4-nav [aria-current="page"]').length,
        expanded: document.querySelectorAll('.v4-nav [aria-expanded="true"]').length,
        locked: getComputedStyle(document.body).overflow === 'hidden',
        links: [...document.querySelectorAll('#v4AllMenu a')].every(link => link.getAttribute('href')),
        minRows: [...document.querySelectorAll('#v4AllMenu a')].every(link => link.getBoundingClientRect().height >= 44),
        menuScrollable: v4AllMenu.scrollHeight > v4AllMenu.clientHeight,
      }))()`);
      assert.equal(opened.active, 1, `${route} ${width}px only menu active`);
      assert.equal(opened.semanticCurrent, 1, `${route} ${width}px aria-current retained`);
      assert.equal(opened.expanded, 1, `${route} ${width}px one expanded control`);
      assert.ok(opened.locked && opened.links && opened.minRows, `${route} ${width}px open menu contract`);
      if (opened.menuScrollable) {
        for (let attempt=0;attempt<12 && !await evaluate('v4AllMenu.scrollTop+v4AllMenu.clientHeight>=v4AllMenu.scrollHeight-2');attempt+=1) await touchSwipe('#v4AllMenu','down');
        assert.ok(await evaluate('v4AllMenu.scrollTop > 0'), `${route} ${width}px menu touch scroll`);
      }
      assert.ok(await evaluate("document.querySelector('#v4AllMenu a:last-of-type').getBoundingClientRect().bottom <= document.querySelector('.v4-nav').getBoundingClientRect().top + 1"), `${route} ${width}px last menu link reachable`);
      await evaluate("document.querySelector('.v4-nav button').click()");
      const closed = await evaluate(`(() => ({active:document.querySelectorAll('.v4-nav:not(.is-menu-open) [aria-current="page"]').length,overflow:document.body.style.overflow,y:scrollY,hidden:v4AllMenu.hidden}))()`);
      assert.equal(closed.active, 1, `${route} ${width}px page active restored`);
      assert.equal(closed.overflow, 'auto', `${route} ${width}px inline overflow restored`);
      assert.equal(closed.y, savedY, `${route} ${width}px scroll position restored`);
      assert.equal(closed.hidden, true, `${route} ${width}px menu closed`);
      await evaluate("document.body.style.removeProperty('overflow')");
    }
  }

  for (const width of widths) {
    await socket.send('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: 720 });
    await navigate('/index.html');
    await assertSingleVisualActive(`${width}px home`);
    const homePresentation = await evaluate(`(() => {
      const kb=getComputedStyle(document.querySelector('.home-kb-section'));
      const feed=getComputedStyle(document.querySelector('.recent-question-panel.v3-community-feed'));
      const agri=getComputedStyle(document.querySelector('.home-agri-summary-section'));
      const surfaces=[document.documentElement,document.body,...document.querySelectorAll('.phone,.pages-wrap,.pages,.page')].map(node=>getComputedStyle(node).backgroundColor);
      const square=[...document.querySelectorAll('.search,.v4-quick-actions>a,.v4-quick-actions>button,.home-kb-section,.home-kb-cards .kb-card,.recent-question-panel,.v3-community-feed .q-card,.post-tag,.community-side-card,.topic-tag-list a,.ai-compact-arrow,.home-agri-summary-section,.home-agri-summary-section .agri-summary-card,.home-agri-summary-section .agri-status,.home-agri-summary-section .agri-summary-more')].every(node=>getComputedStyle(node).borderRadius==='0px'&&getComputedStyle(node).boxShadow==='none');
      return {kbBackground:kb.backgroundColor,kbBorder:kb.borderTopWidth,feedRadius:feed.borderRadius,feedSide:feed.borderLeftWidth,agriRadius:agri.borderRadius,agriBorder:agri.borderTopWidth,whiteSurfaces:surfaces.every(color=>color==='rgb(255, 255, 255)'),square,noSourceCopy:!/공식 출처는 글에서 확인|내용과 출처 확인/.test(homeKbCards.innerText)};
    })()`);
    assert.deepEqual(homePresentation, {kbBackground:'rgb(255, 255, 255)',kbBorder:'0px',feedRadius:'0px',feedSide:'0px',agriRadius:'0px',agriBorder:'0px',whiteSurfaces:true,square:true,noSourceCopy:true}, `${width}px flat white home presentation`);
    const beforeVertical = await evaluate('location.pathname');
    await touchSwipe('body');
    assert.equal(await evaluate('location.pathname'), beforeVertical, `${width}px vertical scroll does not switch tab`);
    await contentSwipeAt(.5, 'left', true);
    assert.equal(await evaluate('location.pathname'), '/channel.html', `${width}px home middle content to community`);
    await assertSingleVisualActive(`${width}px community`);
    await contentSwipeAt(.75, 'left', true);
    assert.equal(await evaluate('location.pathname'), '/kb/index.html', `${width}px community lower content to knowledge`);
    await assertSingleVisualActive(`${width}px knowledge`);
    const kbContract = await evaluate(`(() => ({
      cards:document.querySelectorAll('#kbGrid .kb-card').length,
      forbidden:/공식 출처는 글에서 확인|내용과 출처 확인|\\d{4}-\\d{2}-\\d{2}/.test(kbGrid.innerText),
      intro:document.querySelector('main>h1+p')?.textContent||'',
      images:document.querySelectorAll('#kbGrid .kb-list-thumb').length,
      overflow:document.documentElement.scrollWidth>innerWidth+1
    }))()`);
    assert.ok(kbContract.cards >= 6 && kbContract.images >= 1, `${width}px approved KB list rendered`);
    assert.equal(kbContract.forbidden, false, `${width}px KB date/source CTA hidden`);
    assert.equal(kbContract.intro, '', `${width}px KB intro removed`);
    assert.equal(kbContract.overflow, false, `${width}px KB no horizontal overflow`);
    const kbLayout = await evaluate(`(() => {
      const controls=[kbSearch,kbCategory].map(node=>node.getBoundingClientRect());
      const arrow=getComputedStyle(document.querySelector('.kb-list-arrow'));
      const title=getComputedStyle(document.querySelector('.kb-card strong'));
      return {controlsFit:controls.every(rect=>rect.left>=0&&rect.right<=innerWidth),arrowMode:arrow.writingMode,arrowWrap:arrow.whiteSpace,titleWrap:title.whiteSpace};
    })()`);
    assert.deepEqual(kbLayout, {controlsFit:true,arrowMode:'horizontal-tb',arrowWrap:'nowrap',titleWrap:'normal'}, `${width}px KB stable mobile rows`);
    const searchResult = await evaluate(`(() => {kbSearch.value='관수';kbSearch.dispatchEvent(new Event('input',{bubbles:true}));return {count:kbGrid.querySelectorAll('.kb-card').length,text:kbGrid.innerText}})()`);
    assert.equal(searchResult.count, 1, `${width}px KB search count`);
    assert.match(searchResult.text, /관수/, `${width}px KB search result`);
    const filterResult = await evaluate(`(() => {kbSearch.value='';kbSearch.dispatchEvent(new Event('input',{bubbles:true}));kbCategory.value='스마트팜';kbCategory.dispatchEvent(new Event('change',{bubbles:true}));return {count:kbGrid.querySelectorAll('.kb-card').length,text:kbGrid.innerText}})()`);
    assert.ok(filterResult.count >= 1 && /스마트팜/.test(filterResult.text), `${width}px KB category filter`);
    await evaluate("kbSearch.value='';kbSearch.dispatchEvent(new Event('input',{bubbles:true}));kbCategory.value='';kbCategory.dispatchEvent(new Event('change',{bubbles:true}))");
    await contentSwipeAt(.5, 'left');
    const knowledgeMenuState = await evaluate(`({hidden:v4AllMenu.hidden,trace:window.__swipeTrace,path:location.pathname,h1:document.querySelector('h1')?.getBoundingClientRect().toJSON()})`);
    assert.equal(knowledgeMenuState.hidden, false, `${width}px knowledge to menu ${JSON.stringify(knowledgeMenuState)}`);
    await assertSingleVisualActive(`${width}px menu`, true);
    await evaluate('v4AllMenu.scrollTop=v4AllMenu.scrollHeight');
    assert.ok(await evaluate("v4AllMenu.querySelector('a:last-of-type').getBoundingClientRect().bottom<=document.querySelector('.v4-nav').getBoundingClientRect().top+1"), `${width}px menu last link`);
    await contentSwipeAt(.5, 'right');
    assert.equal(await evaluate('v4AllMenu.hidden'), true, `${width}px menu to knowledge`);
    await assertSingleVisualActive(`${width}px knowledge after menu`);
    await contentSwipeAt(.25, 'right', true);
    assert.equal(await evaluate('location.pathname'), '/channel.html', `${width}px knowledge upper content to community`);
    await contentSwipeAt(.75, 'right', true);
    assert.equal(await evaluate('location.pathname'), '/index.html', `${width}px community lower content to home`);
    const homePath = await evaluate('location.pathname');
    const inputRect = await evaluate(`(() => {const r=globalSearch.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await socket.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:inputRect.x,y:inputRect.y,radiusX:2,radiusY:2,force:1}] });
    await socket.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:Math.max(35,inputRect.x-90),y:inputRect.y,radiusX:2,radiusY:2,force:1}] });
    await socket.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    await delay(250);
    assert.equal(await evaluate('location.pathname'), homePath, `${width}px search input swipe ignored`);
  }

  await socket.send('Emulation.setDeviceMetricsOverride', { width:390, height:720, deviceScaleFactor:1, mobile:true, screenWidth:390, screenHeight:720 });
  await navigate('/channel.html');
  await swipeWhileCommunityRenders();
  await communityRequestRaces();
  await navigate('/index.html');
  await evaluate("openModal('question-help')");
  await delay(250);
  assert.ok(await evaluate("document.querySelector('.modal-overlay.open')!==null"), 'home compose modal opens');
  await ignoredHorizontalSwipe('#postContent');
  assert.equal(await evaluate('location.pathname'), '/index.html', 'modal editing swipe ignored');
  await evaluate("document.querySelector('.modal-overlay.open')?.classList.remove('open'); document.body.style.removeProperty('overflow')");
  await navigate('/channel.html');
  await evaluate('openWriteFlow()');
  await delay(250);
  assert.ok(await evaluate("document.querySelector('.modal-overlay.open')!==null"), 'community compose modal opens');
  await ignoredHorizontalSwipe('#postContent');
  assert.equal(await evaluate('location.pathname'), '/channel.html', 'community writing swipe ignored');

  await socket.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 720, deviceScaleFactor: 1, mobile: true });
  await navigate('/index.html');
  await evaluate("document.querySelector('.v4-nav button').click(); history.pushState({},'',location.pathname+'?menu=1'); history.back()");
  await delay(300);
  assert.deepEqual(await evaluate(`({hidden:v4AllMenu.hidden,active:document.querySelectorAll('.v4-nav:not(.is-menu-open) [aria-current="page"]').length,overflow:document.body.style.overflow})`), { hidden: true, active: 1, overflow: '' }, 'popstate restores closed menu');
  await socket.send('Page.reload', { ignoreCache: true });
  await socket.once('Page.loadEventFired');
  await delay(250);
  assert.deepEqual(await evaluate(`({navs:document.querySelectorAll('.v4-nav').length,menus:document.querySelectorAll('#v4AllMenu').length,active:document.querySelectorAll('.v4-nav:not(.is-menu-open) [aria-current="page"]').length})`), { navs: 1, menus: 1, active: 1 }, 'reload has no duplicate shell');
  assert.deepEqual(fatal, [], `browser fatal errors: ${fatal.join(' | ')}`);
  console.log(`V4 mobile nav/scroll browser: ${widths.length * routes.length}/${widths.length * routes.length} page-width checks PASS`);
} finally {
  try { await socket?.send('Browser.close'); } catch {}
  socket?.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  if (chrome?.exitCode === null && !chrome.killed) chrome.kill();
  await delay(250);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
