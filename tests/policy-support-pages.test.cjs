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
    Date:class extends Date { static now() { return Date.parse('2026-11-02T00:00:00Z'); } }});
  await new Promise(resolve => setImmediate(resolve));
  const cards = root.children[0].children;
  assert.equal(cards.length, 3);
  assert.ok(cards.every(card => /^\/policy\/[a-z0-9-]+\.html$/.test(card.href)));
  assert.equal(cards[0].href, '/policy/2027-local-agri-field-rnd.html');
  assert.equal(cards[0].dataset.state, 'unknown');
  assert.ok(cards.some(card => card.dataset.state === 'open'));
  assert.ok(cards.every(card => card.children[0].children[3].textContent === '접수중'));
  assert.doesNotMatch(read('static/js/policy-home.js'), /innerHTML|BOJO_OPEN_API_KEY/);
});

test('only reviewed official notices have one discoverable static detail each', () => {
  assert.equal(publication.items.length, 6);
  assert.equal(new Set(publication.items.map(item => item.slug)).size, publication.items.length);
  for (const item of publication.items) {
    const url = `https://kfarmai.com/policy/${item.slug}.html`;
    const html = read(`policy/${item.slug}.html`);
    const digest = crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(
      Object.entries(item).filter(([field]) => field !== 'sourceHash')
    ))).digest('hex');
    assert.equal(item.reviewStatus, 'approved');
    assert.equal(item.sourceHash, digest);
    assert.match(item.officialUrl, /^https:\/\/[^/]+\.(?:go|gov)\.kr\//);
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
  for (const item of publication.items.filter(item => !item.applicationStart)) {
    const html = read(`policy/${item.slug}.html`);
    assert.match(html, /<strong class="policy-start-unverified">시작일 원문 확인<\/strong>/);
  }
  assert.match(read('static/css/policy-support.css'), /\.policy-start-unverified \{ color:#b42318; font-weight:800; \}/);
  assert.match(read('static/js/policy-support.js'), /unknown:'접수중'/);
  assert.doesNotMatch(index, /data-status="unknown"|접수 확인/);
  assert.match(read('static/js/policy-support.js'), /if \(!card\.dataset\.start\) return 'unknown'/);
});

test('open filter includes unknown starts while preserving distinct data state', () => {
  const element = (value = '') => ({value, hidden:false, dataset:{}, events:{},
    addEventListener(name, callback) { this.events[name] = callback; },
    setAttribute(name, value) { this[name] = value; }});
  const cards = publication.items.map(item => {
    const card = element();
    card.dataset = {
      region:item.region.join(' '), target:item.targets.join(' '), category:item.categories.join(' '),
      start:item.applicationStart || '', end:item.applicationEnd,
      search:[item.title,item.summary,item.agency,item.support,item.eligibility,...item.region,...item.targets,...item.categories].join(' ').toLocaleLowerCase('ko')
    };
    card.statusLabel = element();
    card.querySelector = () => card.statusLabel;
    return card;
  });
  const fields = {policySearch:element(),regionFilter:element(),targetFilter:element(),
    categoryFilter:element(),resetButton:element(),policyEmpty:element(),noticeCount:element()};
  const buttons = ['all','open','closed'].map(status => {
    const button = element(); button.dataset.status = status; return button;
  });
  const document = {
    getElementById(id) { return fields[id]; },
    querySelectorAll(selector) { return selector === '#noticeList .policy-result' ? cards : buttons; }
  };
  vm.runInNewContext(read('static/js/policy-support.js'), {document, Date:class extends Date {
    static now() { return Date.parse('2026-11-02T00:00:00Z'); }
  }});
  assert.equal(fields.noticeCount.textContent, '6건');
  buttons[1].events.click();
  assert.equal(fields.noticeCount.textContent, '6건');
  assert.equal(cards.filter(card => card.dataset.state === 'unknown').length, 5);
  assert.ok(cards.every(card => card.statusLabel.textContent === '접수중'));
  fields.policySearch.value = '고창';
  fields.policySearch.events.input();
  assert.equal(fields.noticeCount.textContent, '2건');
  fields.regionFilter.value = '전국';
  fields.regionFilter.events.change();
  assert.equal(fields.noticeCount.textContent, '0건');
  fields.resetButton.events.click();
  assert.equal(fields.noticeCount.textContent, '6건');
});
