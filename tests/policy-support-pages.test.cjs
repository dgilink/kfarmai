const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const publication = JSON.parse(read('data/policy-support-notices.json'));
const index = read('subsidy-calendar.html');
const sitemap = read('sitemap.xml');

test('static notice list shows the newest publication dates first', () => {
  const listedSlugs = [...index.matchAll(/class="policy-result"[\s\S]*?href="\/policy\/([a-z0-9-]+)\.html"/g)]
    .map(match => match[1]);
  const expected = [...publication.items].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt) || (a.applicationEnd || '9999-12-31').localeCompare(b.applicationEnd || '9999-12-31'));
  assert.deepEqual(listedSlugs, expected.map(item => item.slug));
  assert.equal(listedSlugs[0], '2027-chungnam-nongsarang-lunar-new-year-promotion');
  assert.equal(listedSlugs[1], '2027-muan-agricultural-sorting-facility');
});

test('home policy preview uses approved, unexpired notices with safe detail links', async () => {
  const node = tag => ({tag, children:[], dataset:{}, append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; }});
  const root = node('div');
  root.children = [node('a')]; // Direct listing fallback until public data loads.
  const document = {getElementById:id => id === 'homePolicyFeed' ? root : null,
    createElement:node, createDocumentFragment:() => node('fragment')};
  const payload = {...publication, items:[...publication.items,
    {...publication.items[0], slug:'not-approved', reviewStatus:'pending'},
    {...publication.items[0], slug:'past-notice', applicationEnd:'2026-01-01'}]};
  vm.runInNewContext(read('static/js/policy-home.js'), {document,
    fetch:async () => ({ok:true,json:async () => payload}),
    Date:class extends Date { static now() { return Date.parse('2026-11-04T00:00:00Z'); } }});
  await new Promise(resolve => setImmediate(resolve));
  const cards = root.children[0].children;
  assert.equal(cards.length, 3);
  assert.ok(cards.every(card => /^\/policy\/[a-z0-9-]+\.html$/.test(card.href)));
  assert.equal(cards[0].href, '/policy/2027-chungnam-nongsarang-lunar-new-year-promotion.html');
  assert.equal(cards[0].dataset.state, 'unknown');
  assert.equal(cards[1].href, '/policy/2027-muan-agricultural-sorting-facility.html');
  assert.equal(cards[2].href, '/policy/2026-shinan-regional-smartfarm-young-farmer-extra.html');
  assert.equal(cards[1].dataset.state, 'upcoming');
  assert.equal(cards[2].dataset.state, 'upcoming');
  assert.doesNotMatch(read('static/js/policy-home.js'), /innerHTML|BOJO_OPEN_API_KEY/);
});

test('only reviewed official notices have one discoverable static detail each', () => {
  assert.equal(publication.items.length, 233);
  assert.equal(publication.items.find(item=>item.slug==='2027-gyeongbuk-nature-bio-rfp-demand-survey').officialUrl, 'https://ccei.creativekorea.or.kr/json/common/fileDown.download?uuid=202611251758391c68fe98-ce21-44f3-97a4-80696c7c441a');
  assert.equal(new Set(publication.items.map(item => item.slug)).size, publication.items.length);
  for (const item of publication.items) {
    const url = `https://kfarmai.com/policy/${item.slug}.html`;
    const html = read(`policy/${item.slug}.html`);
    const digest = crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(
      Object.entries(item).filter(([field]) => field !== 'sourceHash')
    ))).digest('hex');
    assert.equal(item.reviewStatus, 'approved');
    assert.equal(item.sourceHash, digest);
    if (item.slug === '2027-chungnam-nongsarang-lunar-new-year-promotion') assert.equal(item.officialUrl, 'https://www.cnsp.or.kr/project/view.do?seq=1008&pn=1');
    else if (item.slug !== '2027-gyeongbuk-nature-bio-rfp-demand-survey') assert.match(item.officialUrl, /^https:\/\/(?:[^/]+\.(?:go|gov)\.kr\/|www\.ycg\.kr\/open\.content\/ko\/administrative\/news\/announcement\/\?id=\d+(?:&|$)|www\.jvada\.or\.kr\/bbs\/board\.php\?bo_id=notice&wr_id=1213$|www\.foodpolis\.kr\/web\/Board\/4453\/detailView\.do$)/);
    assert.ok(index.includes(`/policy/${item.slug}.html`));
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
    assert.ok(html.includes(item.title));
    assert.ok(html.includes(item.application));
    assert.ok(html.includes('application/ld+json'));
    assert.equal(sitemap.split(`<loc>${url}</loc>`).length - 1, 1);
  }
  assert.equal(sitemap.split('<loc>https://kfarmai.com/subsidy-calendar.html</loc>').length - 1, 1);
});

test('unknown start dates are shown in red on details, without inventing dates', () => {
  assert.doesNotMatch(index, /사업 유형 안내|programList|subsidy_programs\.json/);
  assert.match(index, /지원사업 공고/);
  for (const item of publication.items.filter(item => !item.applicationStart && item.applicationDateStatus !== 'checking')) {
    const html = read(`policy/${item.slug}.html`);
    assert.match(html, /<strong class="policy-start-unverified">시작일 원문 확인<\/strong>/);
  }
  assert.match(read('static/css/policy-support.css'), /\.policy-start-unverified \{ color:#b42318; font-weight:800; \}/);
  assert.match(read('static/js/policy-support.js'), /unknown:'접수중'/);
  assert.doesNotMatch(index, /data-status="unknown"|접수 확인/);
  assert.match(read('static/js/policy-support.js'), /if \(!card\.dataset\.start\) return 'unknown'/);
});

test('Ganghwa application has a date-appropriate static status before JavaScript runs', () => {
  const card = index.split('href="/policy/2026-ganghwa-smartfarm-ict-round-2.html"')[1]?.split('</article>')[0];
  assert.ok(card);
  const item = publication.items.find(item => item.slug === '2026-ganghwa-smartfarm-ict-round-2');
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const expected = today < item.applicationStart ? '접수예정' : today > item.applicationEnd ? '마감' : '접수중';
  assert.ok(card.includes(`class="policy-live-status">${expected}</span>`));
  assert.match(index, /<option>경기<\/option>/);
});

test('policy pages preserve filter and deadline behavior across the full list', () => {
  const element = (value = '') => ({value, hidden:false, dataset:{}, events:{}, children:[],
    addEventListener(name, callback) { this.events[name] = callback; },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this[name] = value; }});
  const cards = publication.items.map(item => {
    const card = element();
    card.dataset = {
      region:item.region.join(' '), target:item.targets.join(' '), category:item.categories.join(' '),
      start:item.applicationStart || '', end:item.applicationEnd || '', endTime:item.applicationEndTime || '', dateStatus:item.applicationDateStatus || '',
      search:[item.title,item.summary,item.agency,item.support,item.eligibility,...item.region,...item.targets,...item.categories].join(' ').toLocaleLowerCase('ko')
    };
    card.statusLabel = element();
    card.querySelector = () => card.statusLabel;
    return card;
  });
  const fields = {policySearch:element(),regionFilter:element(),targetFilter:element(),
    categoryFilter:element(),resetButton:element(),policyEmpty:element(),noticeCount:element(),
    policyPagination:element(),announcements:{scrollIntoView() {}},announcementsTitle:{focus() {}}};
  const buttons = ['all','open','checking','closed'].map(status => {
    const button = element(); button.dataset.status = status; return button;
  });
  const document = {
    createElement:() => element(),
    getElementById(id) { return fields[id]; },
    querySelectorAll(selector) { return selector === '#noticeList .policy-result' ? cards : buttons; }
  };
  let now = Date.parse('2026-11-04T00:00:00Z');
  vm.runInNewContext(read('static/js/policy-support.js'), {document, Date:class extends Date {
    static now() { return now; }
  }});
  assert.equal(fields.noticeCount.textContent, '233건');
  const shown = () => cards.filter(card => !card.hidden);
  const pageButtons = () => fields.policyPagination.children;
  assert.deepEqual(shown(), cards.slice(0, 20));
  assert.equal(pageButtons()[0].disabled, true);
  pageButtons().at(-1).events.click();
  assert.deepEqual(shown(), cards.slice(20, 40));
  assert.equal(fields.noticeCount.textContent, '233건');
  for (let number = 2; number < 12; number++) pageButtons().at(-1).events.click();
  assert.deepEqual(shown(), cards.slice(220));
  assert.equal(pageButtons().at(-1).disabled, true);
  assert.equal(pageButtons().find(button => button['aria-current'] === 'page').textContent, '12');
  pageButtons().find(button => button.textContent === '8').events.click();
  pageButtons().find(button => button.textContent === '6').events.click();
  pageButtons().find(button => button.textContent === '5').events.click();
  assert.deepEqual(shown(), cards.slice(80, 100));
  pageButtons()[0].events.click();
  assert.deepEqual(shown(), cards.slice(60, 80));
  buttons[1].events.click();
  assert.equal(fields.noticeCount.textContent, '58건');
  assert.equal(shown().length, 20);
  assert.equal(pageButtons().find(button => button['aria-current'] === 'page').textContent, '1');
  assert.equal(cards.filter(card => card.dataset.state === 'unknown').length, 25);
  assert.equal(cards.filter(card => card.statusLabel.textContent === '접수예정').length, 161);
  buttons[2].events.click();
  assert.equal(fields.noticeCount.textContent, '14건');
  assert.equal(fields.policyPagination.hidden, true);
  assert.ok(cards.filter(card => !card.hidden).every(card => card.dataset.state === 'checking'));
  buttons[1].events.click();
  fields.policySearch.value = '고창';
  fields.policySearch.events.input();
  assert.equal(fields.noticeCount.textContent, '6건');
  fields.regionFilter.value = '전국';
  fields.regionFilter.events.change();
  assert.equal(fields.noticeCount.textContent, '0건');
  assert.equal(fields.policyPagination.hidden, true);
  assert.equal(fields.policyEmpty.hidden, false);
  fields.resetButton.events.click();
  assert.equal(fields.noticeCount.textContent, '233건');
  assert.deepEqual(shown(), cards.slice(0, 20));
  const timed = cards.find(card => card.dataset.endTime === '17:00');
  now = Date.parse('2026-11-12T07:59:00Z');
  fields.policySearch.events.input();
  assert.equal(timed.dataset.state, 'open');
  now = Date.parse('2026-11-12T08:00:00Z');
  fields.policySearch.events.input();
  assert.equal(timed.dataset.state, 'closed');
});

// Static output must cover the rollover even when client JavaScript is unavailable.
test('expired Gochang notice is retained as closed and Dangjin separates application from publication', () => {
  for (const slug of ['2026-hadong-tea-culture-shop-extra', '2026-pocheon-hanwoo-heifer-cost-support-extra', '2026-hampyeong-fisheries-fuel-subsidy-round-5', '2027-gochang-field-crop-equipment', '2026-uljin-field-crop-demo-round-9', '2027-wanju-field-crop-equipment', '2026-ganghwa-small-agri-processing-startup-round-3', '2026-icheon-farmer-opportunity-income-extra', '2027-jeongeup-field-crop-equipment', '2026-gochang-women-farmers-voucher-round-6', '2027-gunsan-field-crop-equipment', '2026-namyangju-agricultural-residue-shredding-extra']) {
    const closed = index.split(`href="/policy/${slug}.html"`)[1].split('</article>')[0];
    assert.match(closed, /class="policy-live-status">마감<\/span>/);
  }
  const item = publication.items.find(item => item.slug === '2026-dangjin-smart-horticulture-lease-6th');
  assert.equal(item.applicationStart, '2026-11-09');
  assert.equal(item.applicationEnd, '2026-11-12');
  assert.equal(item.applicationEndTime, '17:00');
  assert.equal(item.publishedAt, '2026-10-26');
  assert.match(index, /<option>시설·임대<\/option>/);
  const card = index.split(`href="/policy/${item.slug}.html"`)[1].split('</article>')[0];
  assert.match(card, /class="policy-live-status">마감<\/span>/);
});


test('announced date-check notices have orange static warnings and no invented deadlines', () => {
  const pending = publication.items.filter(item => item.applicationDateStatus === 'checking');
  assert.equal(pending.length, 14);
  for (const item of pending) {
    assert.equal(item.applicationEnd, null);
    assert.ok(item.dateCheckReason);
    const card = index.split(`href="/policy/${item.slug}.html"`)[1].split('</article>')[0];
    assert.match(card, /class="policy-live-status">날짜 확인 중<\/span>/);
    assert.doesNotMatch(card, /접수중|접수예정|>마감<|null|원문 확인까지/);
    const detail = read(`policy/${item.slug}.html`);
    assert.match(detail, /<dl class="policy-facts"><dt>신청 기간<\/dt><dd>[^<]*<strong class="policy-date-unverified">날짜 확인 중<\/strong>/);
    assert.doesNotMatch(detail, /policy-date-check/);
    assert.equal(detail.split('날짜 확인 중</strong>').length - 1, 1);
    assert.doesNotMatch(detail, /null|원문 확인까지|신청기한 원문 확인/);
    if (item.verificationUrl) assert.ok(detail.includes(item.verificationUrl.replaceAll('&', '&amp;')));
  }
  assert.match(read('static/css/policy-support.css'), /policy-date-unverified \{ color:#9a3412; background:#fff7ed; font-weight:800;/);
  assert.match(read('static/css/v4-1-main.css'), /data-state="checking".*?color:#9a3412; background:#fff7ed/);
});

test('date-check home preview rejects missing evidence and never invents a deadline', async () => {
  const node = tag => ({tag,children:[],dataset:{},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;}});
  const root = node('div');
  const source = publication.items.find(item => item.slug === '2027-paju-organic-farming-materials');
  const payload = {schemaVersion:1,items:[
    {...source,slug:'unchecked',reviewStatus:'pending'},
    {...source,slug:'no-reason',dateCheckReason:''},
    {...source,slug:'missing-end',applicationDateStatus:undefined},
    {...source,slug:'../unsafe'}, source
  ]};
  const document = {getElementById:id=>id==='homePolicyFeed'?root:null,createElement:node,createDocumentFragment:()=>node('fragment')};
  vm.runInNewContext(read('static/js/policy-home.js'), {document,fetch:async()=>({ok:true,json:async()=>payload}),Date});
  await new Promise(resolve=>setImmediate(resolve));
  const cards=root.children[0].children;
  assert.equal(cards.length,1);
  assert.equal(cards[0].dataset.state,'checking');
  assert.equal(cards[0].children[0].children[3].textContent,'날짜 확인 중');
  assert.equal(cards[0].children[2].textContent, source.agency);
});

test('date exception preserves approval, official URL and hash checks and requires a reason', () => {
  const run = publication => {
    const writes = new Map();
    const fakeFs = {readFileSync(file){return file.endsWith('policy-support-notices.json')?JSON.stringify(publication):read('sitemap.xml');},
      mkdirSync(){},writeFileSync(file,content){writes.set(file,content);}};
    vm.runInNewContext(read('scripts/pages/build-policy-pages.cjs'),{__dirname:path.join(root,'scripts/pages'),
      require:name=>name==='node:fs'?fakeFs:require(name),URL,console:{log(){}}});
    return writes;
  };
  const rehash = item => ({...item,sourceHash:crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(item).filter(([key])=>key!=='sourceHash')))).digest('hex')});
  const candidate = publication.items.find(item=>item.applicationDateStatus==='checking');
  for (const overrides of [
    {reviewStatus:'pending'}, {officialUrl:'https://example.com/notice'},
    {officialUrl:'https://www.ycg.kr/other/?id=32008'},
    {officialUrl:'https://sub.ycg.kr/open.content/ko/administrative/news/announcement/?id=32008'},
    {officialUrl:'https://www.jvada.or.kr/bbs/board.php?bo_id=notice&wr_id=1214'},
    {officialUrl:'https://www.foodpolis.kr/web/Board/4454/detailView.do'},
    {officialUrl:'https://ccei.creativekorea.or.kr/json/common/fileDown.download?uuid=other'},
    {officialUrl:'https://ccei.creativekorea.or.kr/custom/notice_one.do?seq=39277'},
    {officialUrl:'https://www.cnsp.or.kr/project/view.do?seq=1009&pn=1'},
    {officialUrl:'https://www.cnsp.or.kr/project/view.do?seq=1008&pn=2'},
    {dateCheckReason:''}, {applicationDateStatus:undefined}
  ]) {
    const item=rehash({...candidate,...overrides});
    assert.throws(()=>run({...publication,items:[item]}), /Unreviewed or invalid policy notice/);
  }
  assert.throws(()=>run({...publication,items:[{...candidate,title:'tampered'}]}), /Unreviewed or invalid policy notice/);
  const verified={...candidate,applicationStart:'2026-11-01',applicationEnd:'2026-12-31'};
  delete verified.applicationDateStatus;delete verified.dateCheckReason;
  const html=[...run({...publication,items:[rehash(verified)]}).values()].join('');
  assert.doesNotMatch(html, /<strong>날짜 확인 중<\/strong>/);
  assert.match(html, /2026.11.01 ~ 2026.12.31까지/);
});


test('public artifact verifier allows only explicit date exceptions with visible warnings', () => {
  const os = require('node:os');
  const {spawnSync} = require('node:child_process');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-pages-artifact-policy-date-check-'));
  try {
    const run = (script,...args) => spawnSync(process.execPath,[path.join(root,script),...args],{cwd:root,encoding:'utf8'});
    const build = run('scripts/pages/build-pages-artifact.cjs',`--output=${scratch}`);
    assert.equal(build.status,0,build.stderr);
    const verify=()=>run('scripts/pages/verify-pages-artifact.cjs',scratch);
    assert.equal(verify().status,0);
    const source = publication.items.find(item=>item.applicationDateStatus==='checking');
    const payloadPath=path.join(scratch,'data/policy-support-notices.json');
    const write = item => {
      const cleaned=Object.fromEntries(Object.entries(item).filter(([key])=>key!=='sourceHash'));
      const hashed={...cleaned,sourceHash:crypto.createHash('sha256').update(JSON.stringify(cleaned)).digest('hex')};
      fs.writeFileSync(payloadPath,JSON.stringify({...publication,items:publication.items.map(i=>i.slug===source.slug?hashed:i)}));
    };
    for(const overrides of [{dateCheckReason:''},{applicationDateStatus:undefined},{reviewStatus:'pending'},{verificationUrl:'https://example.com/notice'}]){
      write({...source,...overrides});
      assert.notEqual(verify().status,0,JSON.stringify(overrides));
    }
    write(source);
    const detail=path.join(scratch,`policy/${source.slug}.html`);
    fs.writeFileSync(detail,fs.readFileSync(detail,'utf8').replace('<strong class="policy-date-unverified">날짜 확인 중</strong>',''));
    assert.notEqual(verify().status,0,'date warning must remain visible');
  } finally { fs.rmSync(scratch,{recursive:true,force:true}); }
});

// November 28 review: distinguish actual deadlines from discovery-site dates and workflow milestones.
test('November 28 source review preserves closed notices and isolates conflicting dates', () => {
  const bySlug = slug => publication.items.find(item => item.slug === slug);
  const shinan = bySlug('2026-shinan-salt-packaging-support');
  assert.equal(shinan.applicationStart, '2026-11-16');
  assert.equal(shinan.applicationEnd, '2026-11-19');
  for (const slug of ['2027-gumi-organic-fertilizer-extra', '2027-gunsan-flour-rice-production-complex',
    '2026-ganghwa-smartfarm-ict-round-2', '2027-cheorwon-rural-convergence-loan',
    '2027-iksan-flour-rice-production', '2027-yanggu-organic-fertilizer-change',
    '2027-mokpo-young-fisheries-settlement', '2027-yeosu-young-fisheries-settlement',
    '2027-mafra-women-farmers-health-screening-agency-reannouncement',
    '2026-buyeo-organic-forest-produce-incentive', '2026-gochang-aquaculture-interest-subsidy-round-5', shinan.slug]) {
    const card = index.split(`href="/policy/${slug}.html"`)[1].split('</article>')[0];
    assert.match(card, /class="policy-live-status">마감<\/span>/);
  }
  const hwasun = bySlug('2027-hwasun-agricultural-sorting-facility');
  assert.equal(hwasun.applicationStart, null);
  assert.equal(hwasun.applicationEnd, '2026-12-14');
  assert.equal(hwasun.applicationDateStatus, undefined);
  for (const [slug, start, evidence] of [
    ['2027-goheung-horticulture-programs', null, /2025년.*2026년/],
    ['2027-hadong-successor-farmer-loan-extension', '2026-11-19', /12월 16일.*12월 15일/]
  ]) {
    const item = bySlug(slug);
    assert.equal(item.applicationDateStatus, 'checking');
    assert.equal(item.applicationStart, start);
    assert.equal(item.applicationEnd, null);
    assert.equal(item.applicationEndTime, undefined);
    assert.match(item.dateCheckReason, evidence);
  }
  const kimhae = bySlug('2027-gimhae-young-farmer-custom-startup');
  assert.equal(kimhae.verificationUrl, 'https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000128172');
  assert.equal(bySlug('2027-haman-young-farmer-custom-startup').applicationEndTime, '18:00');
});
