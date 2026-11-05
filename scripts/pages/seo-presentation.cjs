'use strict';
// Publish-only SEO presentation. Source-approved articles and policy notices are never edited.
const fs = require('node:fs');
const path = require('node:path');
const SITE = 'https://kfarmai.com';
const BRAND_IMAGE = `${SITE}/static/kfarmai-logo-horizontal.png`;
const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

function approvedRssItems(outputDir, kbItems) {
  return kbItems.filter(item => /^\/kb\/[a-z0-9-]+\.html$/.test(item.path)).map(item => {
    const html = fs.readFileSync(path.join(outputDir, item.path.slice(1)), 'utf8');
    const head = html.split(/<\/head>/i)[0];
    const robots = head.match(/<meta\s+name=["']robots["'][^>]*content=["']([^"']+)/i)?.[1] || '';
    const canonical = head.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] || '';
    if (/\bnoindex\b/i.test(robots) || canonical !== SITE + item.path) {
      throw new Error(`Published RSS article has noindex or invalid canonical: ${item.path}`);
    }
    const description = head.match(/<meta\s+name=["']description["'][^>]*content=["']([^"']+)/i)?.[1] || item.title;
    return {title:item.title, url:SITE+item.path, description, date:item.date};
  }).slice(0, 30);
}
function renderRss(items) {
  const entries = items.map(item => {
    if (!item.url.startsWith(SITE+'/kb/') || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
      throw Error('Refusing invalid RSS item');
    }
    // Date-only content is deliberately not assigned an invented publication time.
    return `    <item><title>${xml(item.title)}</title><link>${xml(item.url)}</link>`+
      `<guid isPermaLink="true">${xml(item.url)}</guid><description>${xml(item.description)}</description></item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n`+
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>\n`+
    `  <title>KFarmAI 농업정보</title><link>${SITE}/kb/index.html</link>\n`+
    `  <description>공식자료를 확인한 KFarmAI 공개 농업정보</description>\n`+
    `  <language>ko-KR</language><atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml"/>\n`+
    entries+'\n</channel></rss>\n';
}
function appendBeforeHead(html, tags) {
  if (!/<\/head>/i.test(html)) throw Error('Missing HTML head boundary');
  return html.replace(/<\/head>/i, tags + '</head>');
}
function applySeoPresentation(outputDir, kbItems) {
  fs.writeFileSync(path.join(outputDir,'rss.xml'), renderRss(approvedRssItems(outputDir,kbItems)), 'utf8');
  const feedTag = `<link rel="alternate" type="application/rss+xml" title="KFarmAI 농업정보" href="${SITE}/rss.xml">`;
  for (const relative of ['index.html','kb/index.html','subsidy-calendar.html','policy/index.html']) {
    const file = path.join(outputDir, relative);
    if (!fs.existsSync(file)) throw Error(`Missing SEO landing: ${relative}`);
    let html = fs.readFileSync(file,'utf8');
    if (!html.includes('application/rss+xml')) html = appendBeforeHead(html, feedTag);
    fs.writeFileSync(file,html,'utf8');
  }
  const publication = JSON.parse(fs.readFileSync(path.join(outputDir,'data/policy-support-notices.json'),'utf8'));
  const notices = publication.items;
  if (!Array.isArray(notices) || !notices.length) throw Error('Reviewed public policy notices unavailable');
  const validNotices = notices.filter(item => item.reviewStatus === 'approved' && /^[a-z0-9-]+$/.test(item.slug));
  if (validNotices.length !== notices.length) throw Error('Refusing unapproved policy index entries');
  const list = validNotices.sort((a,b) => b.publishedAt.localeCompare(a.publishedAt))
    .map(item => `<li><a href="/policy/${item.slug}.html">${xml(item.title)}</a></li>`).join('\n');
  const landing = path.join(outputDir, 'policy/index.html');
  let html = fs.readFileSync(landing,'utf8');
  if (!html.includes('<!-- POLICY_INDEX_ITEMS -->')) throw Error('Policy index marker missing');
  fs.writeFileSync(landing,html.replace('<!-- POLICY_INDEX_ITEMS -->',list),'utf8');
  for (const item of validNotices) {
    const file = path.join(outputDir,'policy',`${item.slug}.html`);
    if (!fs.existsSync(file)) throw Error(`Approved policy HTML missing: ${item.slug}`);
    html = fs.readFileSync(file,'utf8');
    if (!/<meta\s+property=["']og:image["']/i.test(html)) {
      html = appendBeforeHead(html,`<meta property="og:image" content="${BRAND_IMAGE}">`+
        `<meta name="twitter:card" content="summary"><meta name="twitter:image" content="${BRAND_IMAGE}">`);
      fs.writeFileSync(file,html,'utf8');
    }
  }
}
module.exports = {applySeoPresentation,renderRss,approvedRssItems,xml};
