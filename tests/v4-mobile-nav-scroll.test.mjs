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
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[path.extname(target).toLowerCase()] || 'application/octet-stream';
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

async function waitForEvaluation(expression, timeout = 1000) {
  const deadline = Date.now() + timeout;
  do {
    if (await evaluate(expression)) return;
    await delay(25);
  } while (Date.now() < deadline);
  throw new Error(`condition did not become true within ${timeout}ms: ${expression}`);
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
    window.__post=(title)=>({id:title,title,content:'test',created_at:'2026-10-01',user_id:null,category_id:'category-test'});
    window.__reply=(index,title)=>window.__queries[index].resolve({data:[window.__post(title)],count:1,error:null});
    resetAndLoad();
  })()`);
  assert.equal(await evaluate('window.__queries.length'), 1, 'initial request started');
  await evaluate(`keyword='first';resetAndLoad();keyword='second';resetAndLoad()`);
  assert.equal(await evaluate('window.__queries.length'), 3, 'each search starts despite an older load');
  assert.match(await evaluate('window.__queries[2].filters[0]'), /second/, 'latest query uses latest keyword');
  await evaluate(`window.__reply(2,'second result')`);
  await delay(50);
  await evaluate(`window.__reply(0,'old result');window.__reply(1,'first result')`);
  await delay(50);
  assert.deepEqual(await evaluate(`({titles:[...document.getElementById('postList').querySelectorAll('.post-title')].map(e=>e.textContent),loading:isLoading,count:document.getElementById('resultCount').textContent})`),
    {titles:['second result'],loading:false,count:'1개'}, 'late responses cannot replace the latest search');
  await evaluate(`window.__categoryQueryIndex=window.__queries.length;currentChannel={id:'category-test',name:'질문',slug:'question-help'};resetAndLoad()`);
  assert.equal(await evaluate(`window.__queries[window.__categoryQueryIndex].filters.some(filter=>Array.isArray(filter)&&filter[0]==='category_id'&&filter[1]==='category-test')`),true,'channel filter uses the latest category');
  await evaluate(`window.__reply(window.__categoryQueryIndex,'filtered result')`);
  await delay(50);
  assert.deepEqual(await evaluate("[...document.getElementById('postList').querySelectorAll('.post-title')].map(e=>e.textContent)"),['filtered result'],'filter result replaces previous search');

  await evaluate(`(() => {
    currentChannel=null;keyword='';offset=0;blockedUsersReady=Promise.resolve();
    attachCommentCounts=posts=>new Promise(resolve=>{
      const complete=()=>resolve(posts.map(post=>({...post,comment_count:2,same_symptom_count:1,helpful_count:3})));
      if(posts.some(post=>post.title==='progressive result'))window.__resolveSlowMetrics=complete;
      else complete();
    });
    fetchProfileMap=userIds=>new Promise(resolve=>{
      const complete=()=>resolve(userIds.includes('author-1')?{'author-1':'빠른작성자'}:{});
      if(userIds.includes('author-1'))window.__resolveSlowProfiles=complete;
      else complete();
    });
    window.__progressiveQueryIndex=window.__queries.length;resetAndLoad();
  })()`);
  await evaluate(`(() => {const post=window.__post('progressive result');post.user_id='author-1';window.__queries[window.__progressiveQueryIndex].resolve({data:[post],count:1,error:null})})()`);
  await delay(50);
  assert.deepEqual(await evaluate(`(() => {const card=document.querySelector('#postList .post-card');return{title:card?.querySelector('.post-title')?.textContent,loading:!!document.querySelector('#postList .loading'),comments:card?.querySelector('.post-comments')?.textContent||'',reactions:card?.querySelector('.post-reactions')?.textContent||''}})()`),
    {title:'progressive result',loading:false,comments:'',reactions:''}, 'base posts render before metrics and profiles finish');
  await evaluate(`window.__resolveSlowMetrics();window.__resolveSlowProfiles()`);
  await waitForEvaluation(`(() => {
    const card=document.querySelector('#postList .post-card');
    return card?.querySelector('.post-author')?.textContent==='빠른작성자'
      && card?.querySelector('.post-comments')?.textContent==='댓글 2'
      && card?.querySelector('.post-reactions')?.textContent==='같은 증상 1 · 도움됐어요 3';
  })()`);
  assert.deepEqual(await evaluate(`(() => {const card=document.querySelector('#postList .post-card');return{author:card?.querySelector('.post-author')?.textContent,comments:card?.querySelector('.post-comments')?.textContent,reactions:card?.querySelector('.post-reactions')?.textContent}})()`),
    {author:'빠른작성자',comments:'댓글 2',reactions:'같은 증상 1 · 도움됐어요 3'}, 'metrics and profile enrich the visible cards in place');

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
        globalHeaders: document.querySelectorAll('.v4-global-header').length,
        headerFixed: getComputedStyle(document.querySelector('.v4-global-header')).position,
        headerTop: Math.round(document.querySelector('.v4-global-header').getBoundingClientRect().top),
        brand: document.querySelector('.v4-global-brand')?.textContent.trim(),
        headerLogos: document.querySelectorAll('header img[src*="kfarmai-logo"]').length,
      }))()`);
      assert.ok(initial.xOverflow <= 1, `${route} ${width}px horizontal overflow`);
      assert.equal(initial.navs, 1, `${route} ${width}px single nav`);
      assert.equal(initial.menus, 1, `${route} ${width}px single menu`);
      assert.equal(initial.active, 1, `${route} ${width}px one page tab active`);
      assert.deepEqual({count:initial.globalHeaders,fixed:initial.headerFixed,top:initial.headerTop,brand:initial.brand,logos:initial.headerLogos},
        {count:1,fixed:'fixed',top:0,brand:'kFarmAI',logos:0}, `${route} ${width}px fixed text header`);
      assert.ok(initial.scrollHeight > initial.clientHeight, `${route} ${width}px has vertical content`);
      if (route === '/index.html') assert.equal(initial.phoneOverflow, 'visible', `${route} ${width}px unclipped phone`);

      await evaluate('scrollTo(0,0)');
      await touchSwipe('body', 'down');
      assert.ok(await evaluate('scrollY > 0'), `${route} ${width}px touch scroll to middle`);
      // Chrome may settle a touch fling a few pixels above the document's
      // bottom because the fixed navigation reserves its safe-area edge.
      // Keep the tolerance below one text line so inaccessible content still
      // fails while harmless 1-15px compositor rounding does not.
      const bottomTolerance = 16;
      for (let attempt=0;attempt<12 && !await evaluate(`scrollY+innerHeight>=document.scrollingElement.scrollHeight-${bottomTolerance}`);attempt+=1) await touchSwipe('body','down');
      const bottom = await evaluate(`(() => { const nav=document.querySelector('.v4-nav').getBoundingClientRect(); const remaining=document.scrollingElement.scrollHeight-(scrollY+innerHeight); return {atBottom:remaining<=${bottomTolerance},remaining,y:scrollY,height:document.scrollingElement.scrollHeight,navTop:nav.top,viewport:innerHeight}; })()`);
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
      return {kbBackground:kb.backgroundColor,kbBorder:kb.borderTopWidth,feedRadius:feed.borderRadius,feedSide:feed.borderLeftWidth,agriRadius:agri.borderRadius,agriBorder:agri.borderTopWidth,whiteSurfaces:surfaces.every(color=>color==='rgb(255, 255, 255)'),square,homeSearch:!!document.getElementById('globalSearch'),noSourceCopy:!/공식 출처는 글에서 확인|내용과 출처 확인/.test(homeKbCards.innerText)};
    })()`);
    assert.deepEqual(homePresentation, {kbBackground:'rgb(255, 255, 255)',kbBorder:'0px',feedRadius:'0px',feedSide:'0px',agriRadius:'0px',agriBorder:'0px',whiteSurfaces:true,square:true,homeSearch:true,noSourceCopy:true}, `${width}px flat white home presentation`);
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
      sourceCopy:/공식 출처는 글에서 확인|내용과 출처 확인/.test(kbGrid.innerText),
      dates:[...document.querySelectorAll('#kbGrid .kb-card small')].every(node=>/\\d{4}-\\d{2}-\\d{2}/.test(node.textContent)),
      intro:document.querySelector('main>h1+p')?.textContent||'',
      images:document.querySelectorAll('#kbGrid .kb-list-thumb').length,
      overflow:document.documentElement.scrollWidth>innerWidth+1
    }))()`);
    assert.ok(kbContract.cards >= 6 && kbContract.images === kbContract.cards, `${width}px approved KB list thumbnails rendered`);
    assert.equal(kbContract.sourceCopy, false, `${width}px KB redundant source CTA hidden`);
    assert.equal(kbContract.dates, true, `${width}px KB published dates visible`);
    assert.equal(kbContract.intro, '', `${width}px KB intro removed`);
    assert.equal(kbContract.overflow, false, `${width}px KB no horizontal overflow`);
    const kbLayout = await evaluate(`(() => {
      const arrow=getComputedStyle(document.querySelector('.kb-list-arrow'));
      const title=getComputedStyle(document.querySelector('.kb-card strong'));
      const badges=[...document.querySelectorAll('.kb-topic')];
      return {search:!!document.getElementById('kbSearch'),category:!!document.getElementById('kbCategory'),searchAction:!!document.querySelector('[aria-label="검색"]'),badges:badges.length,badgesFit:badges.every(node=>node.getBoundingClientRect().right<=innerWidth+1),active:badges.filter(node=>node.getAttribute('aria-pressed')==='true').length,arrowMode:arrow.writingMode,arrowWrap:arrow.whiteSpace,titleWrap:title.whiteSpace};
    })()`);
    assert.equal(kbLayout.search,false,`${width}px KB search field removed`);
    assert.equal(kbLayout.category,false,`${width}px KB select removed`);
    assert.equal(kbLayout.searchAction,true,`${width}px KB search icon routes to home`);
    assert.ok(kbLayout.badges>=3&&kbLayout.badgesFit&&kbLayout.active===1,`${width}px KB topic badges fit with one active`);
    assert.deepEqual({arrowMode:kbLayout.arrowMode,arrowWrap:kbLayout.arrowWrap,titleWrap:kbLayout.titleWrap},{arrowMode:'horizontal-tb',arrowWrap:'nowrap',titleWrap:'normal'},`${width}px KB stable rows`);
    const topicResult=await evaluate(`(() => {
      const button=[...document.querySelectorAll('.kb-topic')].find(node=>node.dataset.category==='재배노하우');
      button.click();
      const categories=[...document.querySelectorAll('#kbGrid .kb-card:not([hidden]) small')].map(node=>node.textContent.trim());
      return {selected:button.dataset.category,count:categories.length,allMatch:categories.every(value=>value.includes('재배노하우')),active:document.querySelectorAll('.kb-topic[aria-pressed="true"]').length};
    })()`);
    assert.ok(topicResult.count>=1&&topicResult.allMatch&&topicResult.active===1,`${width}px topic badge filters approved articles`);
    await evaluate("document.querySelector('.kb-topic[data-category=\"\"]')?.click()");
    if (width===390&&process.env.KFARMAI_UI_SCREENSHOT_DIR) {
      const captureRoot=path.resolve(process.env.KFARMAI_UI_SCREENSHOT_DIR);
      fs.mkdirSync(captureRoot,{recursive:true});
      const capture=await socket.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(captureRoot,'kb-index-topics-390.png'),Buffer.from(capture.data,'base64'));
    }
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
  assert.equal(await evaluate("document.getElementById('searchInput')===null"),true,'community search field removed');
  if (process.env.KFARMAI_UI_SCREENSHOT_DIR) {
    const captureRoot=path.resolve(process.env.KFARMAI_UI_SCREENSHOT_DIR);
    fs.mkdirSync(captureRoot,{recursive:true});
    const capture=await socket.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(captureRoot,'channel-fixed-header-390.png'),Buffer.from(capture.data,'base64'));
  }
  const homeSearchLoaded=socket.once('Page.loadEventFired');
  await evaluate("document.querySelector('.v4-global-search-action').click()");
  await homeSearchLoaded;
  await delay(120);
  assert.deepEqual(await evaluate(`({path:location.pathname,focus:document.activeElement?.id})`),{path:'/index.html',focus:'globalSearch'},'non-home search icon opens and focuses home search');
  if (process.env.KFARMAI_UI_SCREENSHOT_DIR) {
    const captureRoot=path.resolve(process.env.KFARMAI_UI_SCREENSHOT_DIR);
    fs.mkdirSync(captureRoot,{recursive:true});
    const capture=await socket.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(captureRoot,'home-focused-search-390.png'),Buffer.from(capture.data,'base64'));
  }
  await navigate('/channel.html');
  await swipeWhileCommunityRenders();
  await communityRequestRaces();
  // Cross-page visual contract: the four previously disconnected tool surfaces
  // must show the same white KFarmAI header and one active bottom-menu tab.
  for (const width of [267, 320, 390, 430]) {
    await socket.send('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: 720 });
    const toolRoutes = width === 267
      ? ['/facility-vegetables.html']
      : ['/agri-weather.html', '/market-prices.html', '/facility-vegetables.html', '/crop-calendar.html', '/subsidy-calendar.html'];
    for (const route of toolRoutes) {
      await navigate(route);
      const toolUi = await evaluate(`(() => {
        const brand=document.querySelector('.v4-global-brand');
        const title=document.querySelector('.kf-tool-title');
        const controls=[...document.querySelectorAll('input:not([type=hidden]),select')].slice(0,4);
        const nav=document.querySelector('.v4-nav');
        const headerInner=document.querySelector('.v4-global-header-inner')?.getBoundingClientRect();
        const actions=document.querySelector('.v4-global-actions')?.getBoundingClientRect();
        const viewportWidth=Math.round(window.visualViewport?.width||innerWidth);
        const surfaces=[document.querySelector('.app'),title,document.querySelector('.content'),...document.querySelectorAll('.content > *')].filter(Boolean);
        const overflowNodes=surfaces.filter(node=>{const rect=node.getBoundingClientRect();return rect.left < -1 || rect.right > viewportWidth + 1}).map(node=>{const rect=node.getBoundingClientRect();return {name:node.tagName+'.'+node.className,left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width)}});
        return {
          text:brand?.textContent?.trim(),
          font:brand&&getComputedStyle(brand).fontSize,
          title:!!title && title.textContent.trim().length>0,
          white:getComputedStyle(document.body).backgroundColor==='rgb(255, 255, 255)',
          overflow:overflowNodes.length>0,
          overflowNodes,
          headerFits:!!headerInner&&headerInner.left>=-1&&headerInner.right<=viewportWidth+1&&actions.right<=viewportWidth+1,
          actionsVisible:!!actions&&actions.width>=${width < 320 ? 83 : 90}&&actions.left>=viewportWidth-110&&actions.right>=viewportWidth-17&&getComputedStyle(document.querySelector('.v4-global-actions')).visibility==='visible',
          actionIcons:[...document.querySelectorAll('.v4-global-action .v4-nav-icon')].filter(icon=>{const rect=icon.getBoundingClientRect();const style=getComputedStyle(icon);return rect.width>=22&&rect.height>=22&&style.visibility==='visible'&&style.opacity==='1'}).length,
          visual:viewportWidth,
          narrow:viewportWidth>=320||document.body.classList.contains('v4-sub320-visual-viewport'),
          active:nav?.querySelectorAll('[aria-current="page"]').length,
          activeLabel:nav?.querySelector('[aria-current="page"]')?.textContent.trim(),
          squared:controls.every(el=>getComputedStyle(el).borderRadius==='0px'),
          tabs:${JSON.stringify(route)}.includes('market-prices')?getComputedStyle(document.querySelector('#typeTabs')).display!=='none':true
        };
      })()`);
      assert.deepEqual(toolUi,{text:'kFarmAI',font:width < 320?'21px':'24px',title:true,white:true,overflow:false,overflowNodes:[],headerFits:true,actionsVisible:true,actionIcons:2,visual:width,narrow:true,active:1,activeLabel:'전체',squared:true,tabs:true}, route+' '+width+'px consistent flat tool design');
      const flatUi = await evaluate(`(() => ({
        loading:[...document.querySelectorAll('.loading')].every(el=>getComputedStyle(el).borderRadius==='0px'),
        cropIcon:[...document.querySelectorAll('.crop-icon')].every(el=>getComputedStyle(el).borderRadius==='0px'&&getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)')
      }))()`);
      assert.deepEqual(flatUi,{loading:true,cropIcon:true}, route+' '+width+'px has no leftover rounded status or crop-icon shapes');
      if (route === '/agri-weather.html') {
        const compactWeather = await evaluate(`(() => ({
          noDistrict:!document.getElementById('regionChips'),
          chooser:!!document.getElementById('cropOptions'),
          collapsed:!document.getElementById('cropOptions').open,
          sources:document.querySelectorAll('.page-source').length,
          longPanels:!!document.getElementById('workPanel')||!!document.getElementById('publicInfoPanel'),
          selected:document.querySelectorAll('#areaChips .active,#typeChips .active,#categoryChips .active,#cropList .active').length,
          prompt:/권역을 선택하면 최신 날씨가 표시됩니다/.test(document.getElementById('weatherPanel').innerText)
        }))()`);
        assert.deepEqual(compactWeather,{noDistrict:true,chooser:true,collapsed:true,sources:1,longPanels:false,selected:0,prompt:true},route+' '+width+'px compact weather contract');
      }
      if (route === '/market-prices.html') {
        const compactMarket = await evaluate(`(() => ({
          sources:document.querySelectorAll('.page-source').length,
          duplicate:!!document.getElementById('fallbackList'),
          verbose:/KAMIS 최근 조사자료|많이 확인하는 품목 참고|시장 흐름 참고자료입니다/.test(document.body.innerText),
          updated:/업데이트/.test(document.getElementById('status').innerText),
          rows:document.querySelectorAll('#list .price-card').length,
          firstChip:document.querySelector('#chips .chip')?.textContent.trim(),
          firstActive:document.querySelector('#chips .chip')?.classList.contains('active'),
          emptyQuery:document.getElementById('q').value===''
        }))()`);
        assert.ok(compactMarket.sources===1&&!compactMarket.duplicate&&!compactMarket.verbose&&compactMarket.updated&&compactMarket.rows>=3&&compactMarket.firstChip==='전체'&&compactMarket.firstActive&&compactMarket.emptyQuery,route+' '+width+'px compact market contract '+JSON.stringify(compactMarket));
      }
      if ((width === 390 || width === 267 && route === '/facility-vegetables.html') && process.env.KFARMAI_UI_SCREENSHOT_DIR) {
        const captureRoot = path.resolve(process.env.KFARMAI_UI_SCREENSHOT_DIR);
        fs.mkdirSync(captureRoot, { recursive:true });
        const capture = await socket.send('Page.captureScreenshot', { format:'png', captureBeyondViewport:false });
        const name = route.slice(1).replace(/[^a-z0-9.-]/gi, '_');
        fs.writeFileSync(path.join(captureRoot, name + '-' + width + '.png'), Buffer.from(capture.data, 'base64'));
      }
    }
  }

  // Samsung Internet can expose a visual viewport that is slightly narrower
  // than its layout viewport. The global actions must still occupy the exact
  // same right-side coordinates on list, tool and map pages.
  for (const width of [320, 390]) {
    await socket.send('Emulation.setDeviceMetricsOverride', { width, height:720, deviceScaleFactor:1, mobile:true, screenWidth:width, screenHeight:720 });
    const actionPositions = [];
    for (const route of ['/kb/index.html', '/facility-vegetables.html', '/agri_map.html']) {
      await navigate(route);
      actionPositions.push(await evaluate(`(() => {
        const actions=[...document.querySelectorAll('.v4-global-action')].map(node=>{const rect=node.getBoundingClientRect();return Math.round((rect.left+rect.right)*10/2)/10});
        return {route:${JSON.stringify(route)},actions,viewport:Math.round(window.visualViewport?.width||innerWidth)};
      })()`));
    }
    const expected = actionPositions[0].actions;
    for (const sample of actionPositions) {
      assert.deepEqual(sample.actions, expected, width+'px shared header action positions '+JSON.stringify(actionPositions));
      assert.equal(sample.viewport, width, width+'px visual viewport');
    }
  }

  // The selected crop details must be a single white reading surface. Text
  // rows may use dividers, but no bordered wrapper may contain more cards.
  for (const width of [320, 390, 430]) {
    await socket.send('Emulation.setDeviceMetricsOverride', { width, height:720, deviceScaleFactor:1, mobile:true, screenWidth:width, screenHeight:720 });
    for (const route of ['/crop-guide.html?crop=pear', '/crop-calendar.html?crop=pear']) {
      await navigate(route);
      const flatCropDetail=await evaluate(`(() => {
        const detail=document.querySelector('#detail');
        const outer=detail?.querySelector(':scope > .card');
        const rows=[...detail.querySelectorAll('.item,.context-card,.mini,.month,.safe')];
        const nested=[...detail.querySelectorAll('.mini,.month')];
        const stageGrid=detail.querySelector('.stage-step-grid');
        return {
          rendered:!!outer,
          white:getComputedStyle(detail).backgroundColor==='rgb(255, 255, 255)',
          outerSides:getComputedStyle(outer).borderLeftWidth==='0px'&&getComputedStyle(outer).borderRightWidth==='0px',
          rowsFlat:rows.every(node=>{const s=getComputedStyle(node);return s.backgroundColor==='rgb(255, 255, 255)'&&s.borderRadius==='0px'&&s.boxShadow==='none'&&s.borderLeftWidth==='0px'&&s.borderRightWidth==='0px'}),
          nestedFlat:nested.length>0&&nested.every(node=>{const s=getComputedStyle(node);return s.borderLeftWidth==='0px'&&s.borderRightWidth==='0px'}),
          stageSingle:!stageGrid||getComputedStyle(stageGrid).gridTemplateColumns.split(' ').length===1,
          width:detail.getBoundingClientRect().width,
          overflow:document.documentElement.scrollWidth>innerWidth+1,
        };
      })()`);
      assert.equal(flatCropDetail.rendered,true,route+' selected detail rendered');
      assert.equal(flatCropDetail.white,true,route+' white surface');
      assert.equal(flatCropDetail.outerSides,true,route+' no outer side box');
      assert.equal(flatCropDetail.rowsFlat,true,route+' text rows are flat');
      assert.equal(flatCropDetail.nestedFlat,true,route+' nested cards removed');
      assert.equal(flatCropDetail.stageSingle,true,route+' stage media uses one column');
      assert.ok(flatCropDetail.width>=width-32,route+' fills mobile bezel');
      assert.equal(flatCropDetail.overflow,false,route+' no horizontal overflow');
      if (width===390&&process.env.KFARMAI_UI_SCREENSHOT_DIR) {
        await evaluate("document.querySelector('#detail .mini-list,#detail .month-grid,#detail .item')?.scrollIntoView({block:'start'})");
        await delay(180);
        const captureRoot=path.resolve(process.env.KFARMAI_UI_SCREENSHOT_DIR);
        fs.mkdirSync(captureRoot,{recursive:true});
        const capture=await socket.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        const name=route.includes('crop-guide')?'crop-guide-detail-pear-390.png':'crop-calendar-detail-pear-390.png';
        fs.writeFileSync(path.join(captureRoot,name),Buffer.from(capture.data,'base64'));
      }
    }
  }

  // Every destination exposed by the full menu, plus the first internal detail
  // screens reached from those destinations, must use the same responsive shell.
  const detailRoutes = [
    '/diagnosis.html', '/diagnosis-cases.html', '/public-data.html', '/agri_map.html',
    '/mfg.html', '/news_sub.html', '/links.html', '/crop-guide.html', '/oauth/privacy/',
  ];
  for (const width of [267, 320, 390, 430]) {
    await socket.send('Emulation.setDeviceMetricsOverride', { width, height:720, deviceScaleFactor:1, mobile:true, screenWidth:width, screenHeight:720 });
    const responsiveDetailRoutes = width === 267 ? ['/agri_map.html'] : detailRoutes;
    for (const route of responsiveDetailRoutes) {
      await navigate(route);
      const detailUi = await evaluate(`(() => {
        const nav=document.querySelector('.v4-nav');
        const globalHeader=document.querySelector('.v4-global-header');
        const firstHeading=document.querySelector('h1');
        const frame=document.querySelector('body.v4-detail-page > .phone,body.v4-detail-page > .app,body.v4-detail-page > main.phone,body.v4-detail-page > main.app,body.v4-detail-page > main.page');
        const footer=document.querySelector('footer,.agri-v3-footer,.site-footer');
        const controls=[...document.querySelectorAll('input:not([type=hidden]),select,textarea,button:not(.v4-nav button)')].slice(0,8);
        const oldMenu=document.querySelector('.kf-menu');
        const headerInner=document.querySelector('.v4-global-header-inner')?.getBoundingClientRect();
        const actions=document.querySelector('.v4-global-actions')?.getBoundingClientRect();
        const viewportWidth=Math.round(window.visualViewport?.width||innerWidth);
        const surfaces=[frame,globalHeader,nav,...document.querySelectorAll('.fixed-map-shell,.list-wrap,.map-panel,.kf-search-bar')].filter(Boolean);
        const overflowNodes=surfaces.filter(node=>{const rect=node.getBoundingClientRect();return rect.left < -1 || rect.right > viewportWidth + 1}).map(node=>{const rect=node.getBoundingClientRect();return {name:node.tagName+'.'+node.className,left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width)}});
        return {
          detail:document.body.classList.contains('v4-detail-page'),
          h1:!!document.querySelector('h1'),
          titleBelowHeader:!globalHeader||!firstHeading||firstHeading.getBoundingClientRect().top>=globalHeader.getBoundingClientRect().bottom-1,
          white:getComputedStyle(document.body).backgroundColor==='rgb(255, 255, 255)',
          footerWhite:!footer||getComputedStyle(footer).backgroundColor==='rgb(255, 255, 255)'||getComputedStyle(footer).backgroundColor==='rgba(0, 0, 0, 0)',
          overflow:overflowNodes.length>0,
          overflowNodes,
          headerFits:!!headerInner&&headerInner.left>=-1&&headerInner.right<=viewportWidth+1&&actions.right<=viewportWidth+1,
          actionsVisible:!!actions&&actions.width>=${width < 320 ? 83 : 90}&&actions.left>=viewportWidth-110&&actions.right>=viewportWidth-17&&getComputedStyle(document.querySelector('.v4-global-actions')).visibility==='visible',
          actionIcons:[...document.querySelectorAll('.v4-global-action .v4-nav-icon')].filter(icon=>{const rect=icon.getBoundingClientRect();const style=getComputedStyle(icon);return rect.width>=22&&rect.height>=22&&style.visibility==='visible'&&style.opacity==='1'}).length,
          visual:viewportWidth,
          narrow:viewportWidth>=320||document.body.classList.contains('v4-sub320-visual-viewport'),
          navCount:nav?.querySelectorAll(':scope>a,:scope>button').length,
          active:nav?.querySelectorAll('[aria-current="page"]').length,
          activeLabel:nav?.querySelector('[aria-current="page"]')?.textContent.trim(),
          frameFull:!frame||Math.abs(frame.getBoundingClientRect().width-viewportWidth)<=1,
          oldMenuHidden:!oldMenu||getComputedStyle(oldMenu).display==='none',
          squared:controls.every(el=>getComputedStyle(el).borderRadius==='0px'),
        };
      })()`);
      assert.deepEqual(detailUi, {detail:true,h1:true,titleBelowHeader:true,white:true,footerWhite:true,overflow:false,overflowNodes:[],headerFits:true,actionsVisible:true,actionIcons:2,visual:width,narrow:true,navCount:4,active:1,activeLabel:'전체',frameFull:true,oldMenuHidden:true,squared:true}, route+' '+width+'px responsive detail design');
      if (route === '/agri_map.html') {
        await evaluate('window.scrollTo(0,240)');
        await delay(100);
        const mapSticky=await evaluate(`(() => {
          const header=document.querySelector('.v4-global-header').getBoundingClientRect();
          const search=document.querySelector('.kf-search-bar').getBoundingClientRect();
          return {top:Math.round(search.top),headerBottom:Math.round(header.bottom),visible:search.top>=header.bottom-1};
        })()`);
        assert.equal(mapSticky.visible,true,route+' '+width+'px search bar stays fully below fixed header '+JSON.stringify(mapSticky));
        await evaluate("window.dispatchEvent(new Event('pageshow'))");
        await delay(100);
        assert.equal(await evaluate('window.scrollY'),0,route+' '+width+'px pageshow restores the complete title and search bar');
        if (width === 267) {
          await evaluate(`(() => {
            Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
              getCurrentPosition(success){success({coords:{latitude:37.5665,longitude:126.978,accuracy:18}})},
              watchPosition(success){success({coords:{latitude:37.5665,longitude:126.978,accuracy:18}});return 1},
              clearWatch(){}
            }});
            window.kakao={maps:{
              LatLng:function(lat,lng){this.lat=lat;this.lng=lng},
              CustomOverlay:function(options){this.setMap=map=>{if(map&&!options.content.isConnected)document.getElementById('agriMap').append(options.content)};this.setMap(options.map)},
              Circle:function(options){this.setMap=()=>{};this.options=options}
            }};
            kakaoMap={setCenter(position){window.__locationCenter={lat:position.lat,lng:position.lng}},setLevel(level){window.__locationLevel=level}};
            document.getElementById('locateButton').disabled=false;
            requestCurrentLocation();
          })()`);
          const locationUi=await evaluate(`(() => ({
            marker:!!document.querySelector('.current-location-dot'),
            status:document.getElementById('mapStatus').textContent,
            busy:document.getElementById('locateButton').getAttribute('aria-busy'),
            disabled:document.getElementById('locateButton').disabled,
            center:window.__locationCenter,
            level:window.__locationLevel
          }))()`);
          assert.deepEqual(locationUi,{marker:true,status:'현재 위치 표시 · 약 18m',busy:'false',disabled:false,center:{lat:37.5665,lng:126.978},level:4},'267px current-location control centers map, reports accuracy and renders red marker');
        }
      }
      if ((width === 390 || width === 267 && route === '/agri_map.html') && process.env.KFARMAI_UI_SCREENSHOT_DIR) {
        const captureRoot=path.resolve(process.env.KFARMAI_UI_SCREENSHOT_DIR);
        fs.mkdirSync(captureRoot,{recursive:true});
        const capture=await socket.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        const name=route.replace(/^\//,'').replace(/\/$/,'index').replace(/[^a-z0-9.-]/gi,'_');
        fs.writeFileSync(path.join(captureRoot,name+'-'+width+'.png'),Buffer.from(capture.data,'base64'));
      }
    }
  }

  // Exercise representative internal controls on every tool family. These are
  // state-only interactions; upload pickers, external links and writes are not
  // triggered by the visual regression test.
  const internalScenarios = [
    ['/agri-weather.html', `document.querySelectorAll('#areaChips .chip')[1]?.click();document.querySelectorAll('#typeChips .chip')[1]?.click();cropOptions.open=true;document.querySelector('#cropList .crop-chip')?.click()`],
    ['/market-prices.html', `document.querySelectorAll('#typeTabs button.tab')[1]?.click();document.querySelector('#chips .chip')?.click()`],
    ['/subsidy-calendar.html', `regionFilter.selectedIndex=Math.min(1,regionFilter.options.length-1);regionFilter.dispatchEvent(new Event('change',{bubbles:true}));resetButton.click()`],
    ['/public-data.html', `document.querySelector('#exampleChips .chip')?.click()`],
    ['/diagnosis.html', `diagExtra.open=true;symptomInput.value='잎이 노랗게 변함';symptomInput.dispatchEvent(new Event('input',{bubbles:true}))`],
    ['/news_sub.html', `document.querySelectorAll('.kf-tab')[1]?.click()`],
  ];
  for (const [route, action] of internalScenarios) {
    await navigate(route);
    await evaluate(`(()=>{${action}})()`);
    await delay(300);
    const state=await evaluate(`(() => ({
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      header:getComputedStyle(document.querySelector('.v4-global-header')).position,
      nav:document.querySelectorAll('.v4-nav').length,
      active:document.querySelectorAll('.v4-nav [aria-current="page"]').length,
      visibleText:(document.body.innerText||'').trim().length>0,
    }))()`);
    assert.deepEqual(state,{overflow:false,header:'fixed',nav:1,active:1,visibleText:true},route+' internal controls keep the shared layout');
    if (process.env.KFARMAI_UI_SCREENSHOT_DIR) {
      const captureRoot=path.resolve(process.env.KFARMAI_UI_SCREENSHOT_DIR);
      fs.mkdirSync(captureRoot,{recursive:true});
      const capture=await socket.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(captureRoot,route.slice(1).replace(/[^a-z0-9.-]/gi,'_')+'-state-390.png'),Buffer.from(capture.data,'base64'));
    }
  }
  await navigate('/mfg.html?category=smart-agriculture&area=smartfarm');
  assert.deepEqual(await evaluate(`(() => ({selected:!!document.querySelector('.hub-card.is-active'),detail:/스마트팜/.test(document.getElementById('inputCategoryGuide')?.innerText||''),overflow:document.documentElement.scrollWidth>innerWidth+1}))()`),
    {selected:true,detail:true,overflow:false},'mfg smart-agriculture detail uses the shared compact layout');

  // Exercise every visible full-menu link through its real click transition.
  await socket.send('Emulation.setDeviceMetricsOverride', { width:390, height:720, deviceScaleFactor:1, mobile:true, screenWidth:390, screenHeight:720 });
  await navigate('/index.html');
  await evaluate("document.querySelector('.v4-nav button[aria-controls=v4AllMenu]').click()");
  const allMenuTargets=await evaluate("[...document.querySelectorAll('#v4AllMenu a')].map(a=>({label:a.textContent.trim(),target:new URL(a.href).pathname+new URL(a.href).search}))");
  assert.equal(allMenuTargets.length, 13, 'all menu exposes thirteen detail links after language settings removal');
  for (let index=0;index<allMenuTargets.length;index+=1) {
    await navigate('/index.html');
    await evaluate("document.querySelector('.v4-nav button[aria-controls=v4AllMenu]').click()");
    const expected=allMenuTargets[index];
    const loaded=socket.once('Page.loadEventFired');
    await evaluate(`document.querySelectorAll('#v4AllMenu a')[${index}].click()`);
    await Promise.race([loaded,delay(4000).then(()=>{throw new Error('menu link did not navigate: '+expected.label);})]);
    await delay(220);
    assert.equal(await evaluate('location.pathname+location.search'), expected.target, expected.label+' click destination');
    assert.equal(await evaluate("document.querySelectorAll('.v4-nav').length"),1,expected.label+' destination shell');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,expected.label+' destination no horizontal overflow');
  }

  await socket.send('Emulation.setDeviceMetricsOverride', { width:390, height:720, deviceScaleFactor:1, mobile:true, screenWidth:390, screenHeight:720 });
  await navigate('/index.html');
  assert.deepEqual(await evaluate(`({legacyActions:document.querySelectorAll('.header-write-btn,.v4-quick-actions').length,quickLinks:document.querySelectorAll('.v4-quick-actions a').length})`), {legacyActions:0,quickLinks:0}, 'home has no duplicate shortcut cards or legacy composer entry');
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
