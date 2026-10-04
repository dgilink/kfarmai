import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const chromePath='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const widths=[320,360,390,430,768,1024,1280];const port=18790,debugPort=19226;
const profileDir=fs.mkdtempSync(path.join(os.tmpdir(),'kfarmai-phase5a-chrome-'));
if(!fs.existsSync(chromePath))throw new Error('Chrome executable is required for responsive verification');

const server=http.createServer((request,response)=>serveStatic(request.url||'/',response));
const chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profileDir}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let socket;
async function run(){
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});await waitForDebug();
    const target=await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'}).then(response=>response.json());
    socket=new CdpSocket(target.webSocketDebuggerUrl);await socket.open();await socket.send('Page.enable');await socket.send('Runtime.enable');
    const fatal=[];socket.on('Runtime.exceptionThrown',event=>fatal.push(event.params?.exceptionDetails?.text||'runtime exception'));
    for(const width of widths){
      await socket.send('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:width<=430});
      const loaded=socket.once('Page.loadEventFired');await socket.send('Page.navigate',{url:`http://127.0.0.1:${port}/mfg.html?responsive=${width}`});await loaded;await delay(250);
      const metrics=await evaluate(socket,`(()=>{const grid=document.getElementById('canonicalCategoryGrid');const main=document.querySelector('.hub-wrap');const directory=document.getElementById('companyDirectorySection');const anchors=[...document.querySelectorAll('main a')];return{innerWidth,scrollWidth:document.documentElement.scrollWidth,mainWidth:Math.round(main?.getBoundingClientRect().width||0),categoryCount:grid?.children.length||0,columns:grid?getComputedStyle(grid).gridTemplateColumns.split(' ').length:0,directoryOpen:directory?.open,infoBeforeDirectory:Boolean(main&&directory&&(main.compareDocumentPosition(directory)&Node.DOCUMENT_POSITION_FOLLOWING)),deadLinks:anchors.filter(a=>!a.getAttribute('href')||a.getAttribute('href')==='#'||/^javascript:/i.test(a.getAttribute('href'))).length,forbidden:/공모전|MVP|시제품|준비중/i.test(main?.innerText||'')}})()`);
      assert.ok(metrics.scrollWidth<=metrics.innerWidth+1,`${width}px horizontal overflow`);assert.equal(metrics.categoryCount,6,`${width}px category count`);assert.equal(metrics.directoryOpen,false,`${width}px vendor directory default`);assert.equal(metrics.infoBeforeDirectory,true,`${width}px information first`);assert.equal(metrics.deadLinks,0,`${width}px dead CTA`);assert.equal(metrics.forbidden,false,`${width}px production copy`);
      if(width<=720)assert.equal(metrics.columns,1,`${width}px one column`);else assert.equal(metrics.columns,3,`${width}px multi column`);if(width>=1024)assert.ok(metrics.mainWidth>430,`${width}px not fixed phone shell`);
    }
    for(const area of ['smartfarm','land-aquafarm']){
      const loaded=socket.once('Page.loadEventFired');await socket.send('Page.navigate',{url:`http://127.0.0.1:${port}/mfg.html?category=smart-agriculture&area=${area}`});await loaded;await delay(250);
      const result=await evaluate(socket,`(()=>({areas:document.querySelectorAll('.smart-area-card').length,entries:document.querySelectorAll('.topic-entry').length,title:document.querySelector('[aria-label$="세부정보"] h3')?.textContent||'',overflow:document.documentElement.scrollWidth>innerWidth+1}))()`);
      assert.equal(result.areas,2,`${area} child areas`);assert.ok(result.entries>=5,`${area} useful entries`);assert.equal(result.overflow,false,`${area} overflow`);
    }
    assert.deepEqual(fatal,[],`browser fatal errors: ${fatal.join(' | ')}`);
    process.stdout.write(`Phase 5A responsive browser: ${widths.length}/${widths.length} widths PASS\n`);
  }finally{
    try{await socket?.send('Browser.close')}catch{}socket?.close();await new Promise(resolve=>server.close(resolve));if(!chrome.killed)chrome.kill();await delay(200);
    const resolved=path.resolve(profileDir);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(resolved,{recursive:true,force:true});
  }
}

function serveStatic(rawUrl,response){
  const url=new URL(rawUrl,`http://127.0.0.1:${port}`);const relative=decodeURIComponent(url.pathname==='/'?'/mfg.html':url.pathname).replace(/^\/+/, '');const target=path.resolve(root,relative);
  if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){response.writeHead(404,{'Content-Type':'text/plain'});response.end('not found');return}
  const extension=path.extname(target).toLowerCase();const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'}[extension]||'application/octet-stream';response.writeHead(200,{'Content-Type':`${mime}; charset=utf-8`,'Cache-Control':'no-store'});
  if(extension==='.html'){const html=fs.readFileSync(target,'utf8').replace(/<script async src="https:\/\/www\.googletagmanager\.com\/[^>]+><\/script>/,'');response.end(html);return}fs.createReadStream(target).pipe(response);
}
async function waitForDebug(){for(let attempt=0;attempt<50;attempt++){try{const response=await fetch(`http://127.0.0.1:${debugPort}/json/version`);if(response.ok)return}catch{}await delay(100)}throw new Error('Chrome DevTools endpoint did not start')}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function evaluate(client,expression){const result=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||'browser evaluation failed');return result.result.value}
class CdpSocket{
  constructor(url){this.url=url;this.id=0;this.pending=new Map();this.listeners=new Map()}
  open(){return new Promise((resolve,reject)=>{this.socket=new WebSocket(this.url);this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true});this.socket.addEventListener('message',event=>this.receive(JSON.parse(event.data)))})}
  send(method,params={}){const id=++this.id;const promise=new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}));this.socket.send(JSON.stringify({id,method,params}));return promise}
  on(method,callback){const rows=this.listeners.get(method)||[];rows.push(callback);this.listeners.set(method,rows)}
  once(method){return new Promise(resolve=>{const callback=params=>{const rows=this.listeners.get(method)||[];this.listeners.set(method,rows.filter(item=>item!==callback));resolve(params)};this.on(method,callback)})}
  receive(message){if(message.id){const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);if(message.error)pending.reject(new Error(message.error.message));else pending.resolve(message.result);return}for(const callback of this.listeners.get(message.method)||[])callback(message)}
  close(){this.socket?.close()}
}
await run();
