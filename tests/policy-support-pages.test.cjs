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

test('only reviewed official notices have one discoverable static detail each', () => {
  assert.equal(publication.items.length, 5);
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

test('prototype business types are removed and start dates are not invented', () => {
  assert.doesNotMatch(index, /사업 유형 안내|programList|subsidy_programs\.json/);
  assert.match(index, /지원사업 공고/);
  for (const item of publication.items.filter(item => !item.applicationStart)) {
    const html = read(`policy/${item.slug}.html`);
    assert.match(html, /시작일 원문 확인/);
  }
  assert.match(read('static/js/policy-support.js'), /if \(!card\.dataset\.start\) return 'unknown'/);
});

test('search, region and status filters keep unknown starts distinct from open', () => {
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
  const buttons = ['all','open','unknown','closed'].map(status => {
    const button = element(); button.dataset.status = status; return button;
  });
  const document = {
    getElementById(id) { return fields[id]; },
    querySelectorAll(selector) { return selector === '#noticeList .policy-result' ? cards : buttons; }
  };
  vm.runInNewContext(read('static/js/policy-support.js'), {document, Date:class extends Date {
    static now() { return Date.parse('2026-11-02T00:00:00Z'); }
  }});
  assert.equal(fields.noticeCount.textContent, '5건');
  buttons[1].events.click();
  assert.equal(fields.noticeCount.textContent, '1건');
  buttons[2].events.click();
  assert.equal(fields.noticeCount.textContent, '4건');
  fields.policySearch.value = '고창';
  fields.policySearch.events.input();
  assert.equal(fields.noticeCount.textContent, '2건');
  fields.regionFilter.value = '전국';
  fields.regionFilter.events.change();
  assert.equal(fields.noticeCount.textContent, '0건');
  fields.resetButton.events.click();
  assert.equal(fields.noticeCount.textContent, '5건');
});
