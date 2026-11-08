'use strict';
// Notify IndexNow only for changed, approved, live canonical URLs AFTER Pages deploy.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const SITE = 'https://kfarmai.com';
const KEY = fs.readFileSync(path.join(ROOT,'indexnow-key.txt'),'utf8').trim();
const KEY_URL = `${SITE}/indexnow-key.txt`;
const INDEXABLE_TOOL_FILES = Object.freeze(["crop-calendar.html","crop-guide.html","agri-weather.html","diagnosis.html"]);
function git(args) {return cp.execFileSync('git',args,{cwd:ROOT,encoding:'utf8',timeout:12000}).trim();}
function assertKey(key) {if (!/^[a-f0-9]{32}$/.test(key)) throw Error('Invalid public IndexNow ownership key');}
function selectUrls(changed, sitemap, approvedKb, approvedPolicy) {
  const valid = new Set([...sitemap.matchAll(/<loc>(https:\/\/kfarmai\.com\/[^<]*)<\/loc>/g)].map(m=>m[1]));
  const candidates = new Set();
  for (const file of changed) {
    if (INDEXABLE_TOOL_FILES.includes(file)) candidates.add(SITE+'/'+file);
    if (/^kb\/[a-z0-9-]+\.html$/.test(file) && approvedKb.has(file)) candidates.add(SITE+'/'+file);
    if (/^policy\/[a-z0-9-]+\.html$/.test(file) && approvedPolicy.has(file)) candidates.add(SITE+'/'+file);
    if (file === 'index.html') candidates.add(SITE+'/');
    if (file === 'kb/index.html') candidates.add(SITE+'/kb/index.html');
    if (file === 'policy/index.html') candidates.add(SITE+'/policy/index.html');
    if (file === 'subsidy-calendar.html') candidates.add(SITE+'/subsidy-calendar.html');
  }
  if (changed.includes('scripts/pages/seo-presentation.cjs')) {
    for (const file of approvedPolicy) candidates.add(SITE+'/'+file);
    for (const url of [SITE+'/',SITE+'/kb/index.html',SITE+'/policy/index.html',SITE+'/subsidy-calendar.html']) candidates.add(url);
  }
  // When this notifier contract changes, resubmit only these approved tool canonical URLs once.
  if (changed.includes('scripts/seo/indexnow-notify.cjs')) {
    for (const file of INDEXABLE_TOOL_FILES) candidates.add(SITE+'/'+file);
  }
  return [...candidates].filter(url => valid.has(url)).sort();
}
function noindexInHead(body) {
  const head=body.split(/<\/head>/i)[0];
  return [...head.matchAll(/<meta\b[^>]*>/gi)].some(([tag]) =>
    /\bname=["'](?:robots|googlebot|bingbot)["']/i.test(tag) &&
    /\bcontent=["'][^"']*\bnoindex\b/i.test(tag));
}
async function requestText(url, timeoutMs=16000) {
  const response=await fetch(url,{redirect:'follow',headers:{'User-Agent':'KFarmAI-IndexNow/1.0'},signal:AbortSignal.timeout(timeoutMs)});
  if (response.status !== 200 || response.url !== url) throw Error(`Live URL unavailable or redirected: ${new URL(url).pathname} (${response.status})`);
  return {body:await response.text(),headers:response.headers};
}
async function main() {
  assertKey(KEY);
  const execute=process.argv.includes('--execute');
  const head=git(['rev-parse','HEAD']);
  const branch=git(['symbolic-ref','--short','HEAD']);
  if (branch !== 'main') throw Error('Refusing non-main branch notification');
  const changed=git(['diff','--name-only','--diff-filter=ACMRT','HEAD^','HEAD']).split(/\r?\n/).filter(Boolean);
  const rss=fs.readFileSync(path.join(ROOT,'_site/sitemap.xml'),'utf8');
  const reg=JSON.parse(fs.readFileSync(path.join(ROOT,'automation/daily_registry.json'),'utf8'));
  const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/policy-support-notices.json'),'utf8'));
  const kb=new Set(reg.items.filter(x => x.url === SITE+'/kb/'+x.slug+'.html').map(x=>'kb/'+x.slug+'.html'));
  const policyFiles=new Set(policy.items.filter(x => x.reviewStatus === 'approved').map(x=>'policy/'+x.slug+'.html'));
  const urls=selectUrls(changed,rss,kb,policyFiles);
  if (urls.length > 100) throw Error('Refusing oversized new-URL submission');
  if (!execute) {process.stdout.write(`[IndexNow 최종 검증 결과] 모드=DRY_RUN, 변경 파일=${changed.length}, 후보 URL=${urls.length}, 제출=미수행, 판정=PASS\n`);return;}
  if (git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0] !== head) throw Error('Main HEAD advanced after deploy: no notification');
  const file=await requestText(KEY_URL);
  if (file.body.trim()!==KEY) throw Error('Published IndexNow ownership proof mismatch');
  if (urls.length===0) {process.stdout.write('[IndexNow 최종 검증 결과] 후보 URL=0, 제출=없음, 판정=PASS\n');return;}
  for (let i=0;i<urls.length;i+=4) {
    await Promise.all(urls.slice(i,i+4).map(async url=>{
      const page=await requestText(url);
      if (/\bnoindex\b/i.test(page.headers.get('x-robots-tag')||'') || noindexInHead(page.body)) throw Error(`Live noindex: ${new URL(url).pathname}`);
      const canonical=page.body.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1];
      if (canonical!==url) throw Error(`Live canonical mismatch: ${new URL(url).pathname}`);
    }));
  }
  const response=await fetch('https://api.indexnow.org/indexnow', {
    method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},signal:AbortSignal.timeout(18000),
    body:JSON.stringify({host:'kfarmai.com',key:KEY,keyLocation:KEY_URL,urlList:urls})
  });
  if (![200,202].includes(response.status)) throw Error(`IndexNow request rejected: HTTP ${response.status}`);
  process.stdout.write(`[IndexNow 최종 검증 결과] HEAD=${head.slice(0,12)}, 변경 파일=${changed.length}, 제출 URL=${urls.length}, HTTP=${response.status}, 판정=PASS(수신, 색인 미보장)\n`);
}
if (require.main===module) main().catch(error=>{process.stderr.write(`[IndexNow 최종 검증 결과] 판정=FAIL, 원인=${error.message}\n`);process.exitCode=1;});
module.exports={selectUrls,noindexInHead,assertKey};
