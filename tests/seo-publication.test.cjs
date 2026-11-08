'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const {renderRss}=require('../scripts/pages/seo-presentation.cjs');
const {selectUrls,noindexInHead,assertKey}=require('../scripts/seo/indexnow-notify.cjs');
const {urlsOf}=require('./sitemap-contract.cjs');

test('Sitemap omits existing noindex KB pages and preserves approved originals',()=>{
  const source=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
  const urls=urlsOf(source);
  const kb=JSON.parse(fs.readFileSync(path.join(root,'automation/daily_registry.json'),'utf8')).items;
  const policies=JSON.parse(fs.readFileSync(path.join(root,'data/policy-support-notices.json'),'utf8')).items;
  for(const item of kb) assert.ok(urls.includes(item.url),`approved KB missing: ${item.slug}`);
  for(const item of policies.filter(p=>p.reviewStatus==='approved')) assert.ok(urls.includes(`https://kfarmai.com/policy/${item.slug}.html`));
  assert.ok(urls.includes('https://kfarmai.com/kb/index.html'));
  assert.ok(urls.includes('https://kfarmai.com/policy/index.html'));
  for(const url of urls.filter(u=>u.includes('/kb/'))) {
    const relative=url.slice('https://kfarmai.com/'.length);
    const html=fs.readFileSync(path.join(root,relative),'utf8');
    assert.doesNotMatch(html.split(/<\/head>/i)[0],/<meta\s+name=["']robots["'][^>]*content=["'][^"']*noindex/i,relative);
  }
});
test('RSS escapes XML and contains no unreviewed URLs',()=>{
  const rss=renderRss([{title:'농업 & 정책',description:'작물 <안내>',url:'https://kfarmai.com/kb/example.html',date:'2026-11-05'}]);
  assert.match(rss, /농업 &amp; 정책/);
  assert.match(rss, /작물 &lt;안내&gt;/);
  assert.match(rss, /<guid isPermaLink="true">https:\/\/kfarmai\.com\/kb\/example\.html<\/guid>/);
  assert.doesNotMatch(rss,/pending|private|unapproved/i);
});
test('IndexNow selection permits only published changed URLs',()=>{
  const sitemap='<loc>https://kfarmai.com/kb/good.html</loc><loc>https://kfarmai.com/policy/ok.html</loc>';
  const changed=['kb/good.html','kb/draft.html','policy/ok.html','policy/private.html','oauth/index.html'];
  const urls=selectUrls(changed,sitemap,new Set(['kb/good.html']),new Set(['policy/ok.html']));
  assert.deepEqual(urls,['https://kfarmai.com/kb/good.html','https://kfarmai.com/policy/ok.html']);
});
test('IndexNow safely rejects noindex and bad ownership proof',()=>{
  assert.equal(noindexInHead('<head><meta name="robots" content="noindex, follow"></head>'),true);
  assert.equal(noindexInHead('<head><meta name="robots" content="index,follow"></head>'),false);
  assert.throws(()=>assertKey('unsafe'));
  assert.doesNotThrow(()=>assertKey('0123456789abcdef0123456789abcdef'));
});

test('IndexNow whitelist includes public tool canonical URLs, never query variants', () => {
  const tools = ["crop-calendar.html","crop-guide.html","agri-weather.html","diagnosis.html"];
  const sitemap = tools.map(file => '<loc>https://kfarmai.com/'+file+'</loc>').join('');
  const expected = tools.map(file => 'https://kfarmai.com/'+file).sort();
  const approvedKb = new Set(), approvedPolicy = new Set();
  assert.deepEqual(selectUrls(tools, sitemap, approvedKb, approvedPolicy), expected);
  assert.deepEqual(selectUrls(['scripts/seo/indexnow-notify.cjs'], sitemap, approvedKb, approvedPolicy), expected);
  assert.deepEqual(selectUrls(['crop-calendar.html?crop=monstera'], sitemap, approvedKb, approvedPolicy), []);
});
