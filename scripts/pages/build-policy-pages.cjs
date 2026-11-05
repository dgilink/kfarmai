const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'data/policy-support-notices.json');
const publication = JSON.parse(fs.readFileSync(source, 'utf8'));
const items = publication.items;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => value ? value.replaceAll('-', '.') : '원문 확인';
const checkingDates = item => item.applicationDateStatus === 'checking';
const deadline = item => item.applicationEnd || '9999-12-31';
const dateLabel = item => checkingDates(item) ? '날짜 확인 중' : `${date(item.applicationEnd)}까지`;
const digest = item => crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(
  Object.entries(item).filter(([key]) => key !== 'sourceHash')
))).digest('hex');
const validOfficial = value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password &&
    (/\.(?:go|gov)\.kr$/.test(url.hostname) || ['bojo.go.kr', 'agrix.go.kr'].includes(url.hostname));
};
if (publication.schemaVersion !== 1 || !Array.isArray(items) || !items.length) throw Error('No reviewed policy notices');
const slugs = new Set();
for (const item of items) {
  const datesValid = (item.applicationStart === null || /^\d{4}-\d{2}-\d{2}$/.test(item.applicationStart)) &&
    (checkingDates(item) ? item.applicationEnd === null && typeof item.dateCheckReason === 'string' && item.dateCheckReason.trim() :
      /^\d{4}-\d{2}-\d{2}$/.test(item.applicationEnd));
  if (item.reviewStatus !== 'approved' || !/^[a-z0-9-]+$/.test(item.slug) || slugs.has(item.slug) ||
    !validOfficial(item.officialUrl) || (item.verificationUrl && !validOfficial(item.verificationUrl)) ||
    !item.title || !item.agency || !datesValid ||
    !/^\d{4}-\d{2}-\d{2}$/.test(item.verifiedAt) || item.sourceHash !== digest(item)) {
    throw Error('Unreviewed or invalid policy notice: ' + item.slug);
  }
  slugs.add(item.slug);
}

const shell = (title, description, canonical, body, structured = '') => `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/static/kfarmai-logo-horizontal.png">
<title>${esc(title)} | KFarmAI</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="https://kfarmai.com${canonical}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="https://kfarmai.com${canonical}"><meta property="og:type" content="article">
<link rel="stylesheet" href="/static/css/v4-shell.css?v=20261029-header8">
<link rel="stylesheet" href="/static/css/v4-tool-pages.css?v=20261029-compact1">
<link rel="stylesheet" href="/static/css/policy-support.css?v=20261105-date-check">
<script src="/static/js/v4-shell.js?v=20261029-header8" defer></script>${structured}
</head><body class="v4-page kf-tool-page kf-subsidy"><main class="app">
<header class="header"><div class="top"><a class="brand" href="/index.html" aria-label="KFarmAI 홈">KFarmAI</a></div></header>
${body}</main></body></html>
`;

const sorted = [...items].sort((a,b) => b.publishedAt.localeCompare(a.publishedAt) ||
  deadline(a).localeCompare(deadline(b)));
const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const listingStatus = item => checkingDates(item) ? '날짜 확인 중' : item.applicationEnd < todayKst ? '마감' :
  item.applicationStart && item.applicationStart > todayKst ? '접수예정' : '접수중';
const cards = sorted.map(item => `<article class="policy-result"${checkingDates(item) ? ' data-date-status="checking" data-state="checking"' : ''} data-region="${esc(item.region.join(' '))}" data-target="${esc(item.targets.join(' '))}" data-category="${esc(item.categories.join(' '))}" data-start="${esc(item.applicationStart || '')}" data-end="${esc(item.applicationEnd)}" data-search="${esc([item.title,item.summary,item.agency,item.support,item.eligibility,...item.region,...item.targets,...item.categories].join(' ').toLocaleLowerCase('ko'))}">
<a class="policy-card-link" href="/policy/${item.slug}.html"><div class="policy-meta"><span class="policy-meta-group"><span class="policy-region">${esc(item.region.join(' · '))}</span><span class="policy-meta-separator" aria-hidden="true">·</span><span class="policy-category">${esc(item.categories.join(' · '))}</span><span class="policy-meta-separator" aria-hidden="true">·</span><span class="policy-published">${esc(item.publishedAt)}</span></span><span class="policy-live-status">${listingStatus(item)}</span></div>
<h3>${esc(item.title)}</h3>
<div class="policy-card-foot"><span>${checkingDates(item) ? '' : `${dateLabel(item)} · `}${esc(item.agency)}</span><span aria-hidden="true">›</span></div></a></article>`).join('\n');
const index = shell('농업 지원사업 공고 찾기', '농업 지원사업 신청 공고를 지역, 대상, 분야, 신청기한별로 검색하고 상세 조건과 공식 원문을 확인하세요.', '/subsidy-calendar.html', `
<h1 class="kf-tool-title">정책·지원</h1><div class="content">
<section class="policy-section policy-find" aria-label="지원사업 검색">
<label for="policySearch">지원사업 검색</label>
<input id="policySearch" type="search" placeholder="예: 유기농업자재, 전북, 농업법인" autocomplete="off">
<div class="filters"><select id="regionFilter" class="select" aria-label="지역 선택"><option value="">전체 지역</option><option>전국</option><option>전북</option><option>경기</option><option>충남</option><option>경북</option><option>경남</option><option>전남</option></select>
<select id="targetFilter" class="select" aria-label="대상 선택"><option value="">전체 대상</option><option>농업인</option><option>농업법인</option><option>지방정부</option></select>
<select id="categoryFilter" class="select" aria-label="분야 선택"><option value="">전체 분야</option><option>친환경</option><option>농기계</option><option>유통·가공</option><option>연구개발</option><option>시설·임대</option><option>축산·조사료</option></select></div>
<button id="resetButton" class="reset" type="button">초기화</button></section>
<section id="announcements" class="policy-section" aria-labelledby="announcementsTitle">
<div class="policy-section-head"><h2 id="announcementsTitle">지원사업 공고</h2><span id="noticeCount" aria-live="polite">${items.length}건</span></div>
<div class="policy-status-filters" role="group" aria-label="접수 상태">
<button type="button" data-status="all" aria-pressed="true">전체</button><button type="button" data-status="open" aria-pressed="false">접수중</button><button type="button" data-status="checking" aria-pressed="false">날짜 확인 중</button><button type="button" data-status="closed" aria-pressed="false">마감</button></div>
<div id="noticeList">${cards}</div><p id="policyEmpty" class="policy-empty" hidden>조건에 맞는 공고가 없습니다. 검색어나 필터를 바꿔보세요.</p></section>
<section id="official-sources" class="policy-section policy-sources" aria-labelledby="sourceTitle"><h2 id="sourceTitle">공식 공고 검색처</h2>
<div class="policy-source-links"><a href="https://www.bojo.go.kr/da/getDA001200View.do" target="_blank" rel="noopener noreferrer">보조금통합포털 <span>공모사업 ↗</span></a>
<a href="https://uni.agrix.go.kr/webportal/main/portalBizGuideList.do" target="_blank" rel="noopener noreferrer">AgriX <span>농식품사업 지침 ↗</span></a>
<a href="https://www.mafra.go.kr/" target="_blank" rel="noopener noreferrer">농림축산식품부 <span>공고 ↗</span></a></div></section>
<p class="policy-endnote">신청 대상·지역·자부담과 마감 시간은 공고마다 다릅니다. 신청 전 공식 원문을 확인하세요.</p></div>
<script src="/static/js/policy-support.js?v=20261105-date-check" defer></script>`);
fs.writeFileSync(path.join(root,'subsidy-calendar.html'), index);

const detailDir = path.join(root, 'policy');
fs.mkdirSync(detailDir, {recursive:true});
for (const item of items) {
  const url = `/policy/${item.slug}.html`;
  const structured = `<script type="application/ld+json">${JSON.stringify({
    '@context':'https://schema.org','@type':'Article',headline:item.title,description:item.summary,
    datePublished:item.publishedAt,dateModified:item.verifiedAt,mainEntityOfPage:`https://kfarmai.com${url}`,
    author:{'@type':'Organization',name:'KFarmAI'},citation:item.officialUrl
  }).replaceAll('<','\\u003c')}</script>`;
  const body = `<div class="content policy-detail"><nav class="policy-breadcrumb" aria-label="현재 위치"><a href="/subsidy-calendar.html">정책·지원 목록</a><span aria-hidden="true">›</span><span>공고 상세</span></nav>
<article><div class="policy-meta"><span>${esc(item.region.join(' · '))}</span><span>${esc(item.categories.join(' · '))}</span><span>${esc(item.agency)}</span></div>
<h1>${esc(item.title)}</h1><p class="policy-detail-lead">${esc(item.summary)}</p>
${checkingDates(item) ? `<div class="policy-date-check"><strong>날짜 확인 중</strong><p>${esc(item.dateCheckReason)}</p></div>` : ''}
<dl class="policy-facts"><dt>신청 기간</dt><dd>${checkingDates(item) ? `${item.applicationStart ? `${date(item.applicationStart)}부터 · ` : ''}<strong class="policy-date-unverified">날짜 확인 중</strong>` : `${item.applicationStart ? `${date(item.applicationStart)} ~ `: '<strong class="policy-start-unverified">시작일 원문 확인</strong> · '}${date(item.applicationEnd)}까지`}</dd>
<dt>지원 대상</dt><dd>${esc(item.eligibility)}</dd><dt>지원 내용</dt><dd>${esc(item.support)}</dd>
<dt>신청·문의</dt><dd>${esc(item.application)}</dd>
<dt>${item.verificationUrl ? '공식 등록' : '원문 게시'}</dt><dd>${date(item.publishedAt)}</dd><dt>자료 확인</dt><dd>${date(item.verifiedAt)}</dd></dl>
<p class="policy-detail-note">${esc(item.note)}</p>
<a class="policy-detail-cta" href="${esc(item.officialUrl)}" target="_blank" rel="noopener noreferrer">공식 공고·첨부 지침 확인 ↗</a>
${item.verificationUrl ? `<p><a class="policy-verification-link" href="${esc(item.verificationUrl)}" target="_blank" rel="noopener noreferrer">공식 등록 안내 확인 ↗</a></p>` : ''}
<p class="policy-endnote">KFarmAI 정리 · 최종 신청 자격과 변경 공고는 운영기관 원문을 기준으로 확인하세요.</p></article>
<a class="policy-back" href="/subsidy-calendar.html">← 지원사업 목록으로</a></div>`;
  fs.writeFileSync(path.join(detailDir, item.slug+'.html'),
    shell(item.title, `${item.summary} ${checkingDates(item) ? '날짜 확인 중' : `신청기한 ${date(item.applicationEnd)}`}. ${item.agency} 원문 확인.`, url, body, structured));
}

const sitemapPath = path.join(root,'sitemap.xml');
let sitemap = fs.readFileSync(sitemapPath,'utf8');
const entries = [`  <url><loc>https://kfarmai.com/subsidy-calendar.html</loc><lastmod>${publication.updatedAt}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`,
  ...items.map(item => `  <url><loc>https://kfarmai.com/policy/${item.slug}.html</loc><lastmod>${item.verifiedAt}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`)].join('\n');
sitemap = sitemap.replace(/  <!-- policy-support start -->[\s\S]*?  <!-- policy-support end -->/, `  <!-- policy-support start -->\n${entries}\n  <!-- policy-support end -->`);
fs.writeFileSync(sitemapPath,sitemap);
console.log(`Policy pages generated: ${items.length} details and searchable index.`);
