const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  policyDate, policyKstToday, policyOfficialUrl, policySnapshot,
  policyStatus, policyFilter, policyCard
} = require('../static/js/policy-support.js');

const root = path.join(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/policy-support/approved.sample.json')));
const item = fixture.items[0];

test('approved snapshot and strict dates fail closed', () => {
  assert.equal(policySnapshot(fixture).items.length, 2);
  assert.equal(policySnapshot(JSON.parse(fs.readFileSync(path.join(root,'data/policy-support-approved.json')))).items.length, 0);
  assert.equal(policyDate('2026-02-30'), false);
  assert.equal(policyDate('2026-12-31'), true);
  assert.throws(() => policySnapshot({...fixture, items:[{...item,reviewStatus:'pending'}]}));
  assert.throws(() => policySnapshot({...fixture, items:[{...item,applicationEnd:'2026-02-30'}]}));
  assert.throws(() => policySnapshot({...fixture, items:[{...item,officialUrl:'https://bojo.go.kr.evil.test/'}]}));
  assert.throws(() => policySnapshot({...fixture, items:[{...item,applicationStart:'2099-12-31',applicationEnd:'2026-01-01'}]}));
  assert.equal(policyOfficialUrl('javascript:alert(1)'), null);
});

test('KST date, status and national-region filtering', () => {
  assert.equal(policyKstToday(new Date('2026-10-28T15:30:00Z')), '2026-10-29');
  assert.equal(policyStatus(item,'2026-10-29'),'접수 중');
  assert.equal(policyStatus(item,'2100-01-01'),'마감');
  assert.equal(policyStatus({...item,applicationStart:'2026-11-01'},'2026-10-29'),'예정');
  assert.deepEqual(policyFilter(fixture.items,{region:'전남',target:'청년농',category:'교육',status:'마감'},'2026-10-29').map(x=>x.externalId),['sample-closed']);
  assert.deepEqual(policyFilter(fixture.items,{region:'경기',target:'농업인',category:'시설원예',status:'접수 중'},'2026-10-29').map(x=>x.externalId),['sample-open']);
});

test('sample is clearly marked and official links cannot be injected', () => {
  const html = policyCard({...item,title:'<script>alert(1)</script>'}, '2026-10-29', true);
  assert.match(html, /화면 시험 자료 · 신청 불가/);
  assert.doesNotMatch(html, /href=/);
  assert.doesNotMatch(html, /<script>/);
  const page = fs.readFileSync(path.join(root,'subsidy-calendar.html'),'utf8');
  assert.match(page, /id="approvedList"/);
  assert.match(page, /id="referenceSection"/);
  assert.match(page, /실제 공고·신청 정보가 아닙니다/);
  assert.match(fs.readFileSync(path.join(root,'static/js/policy-support.js'),'utf8'), /localhost\|127/);
});
