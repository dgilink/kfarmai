'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const article = fs.readFileSync(path.join(__dirname, '..', 'kb/2026-basic-public-interest-direct-payment-schedule.html'), 'utf8');

test('verified 2026 MAFRA direct-payment awareness video is the only iframe', () => {
  assert.equal(article.split('<iframe').length - 1, 1);
  assert.match(article, /src="https:\/\/www\.youtube-nocookie\.com\/embed\/3qrJMtOcmTU"/);
  assert.match(article, /title="농림축산식품부 공식 영상: 공익직불제 풍년상회/);
  assert.match(article, /2026년 11월 11일 공개한 공식 영상/);
  assert.match(article, /2026년 직불금 입금일·지급액을 안내하는 영상은 아니며/);
  assert.match(article, /class="kf-video-frame"/);
  assert.match(article, /aspect-ratio:16\/9/);
  assert.match(article, /loading="lazy"/);
  assert.match(article, /href="https:\/\/www\.youtube\.com\/watch\?v=3qrJMtOcmTU"/);
  assert.doesNotMatch(article, /L7nlcr6RciM|autoplay=1|2024년 7월 30일/);
});
test('article media, canonical, original source links and related link remain unchanged', () => {
  assert.match(article, /data-media-role="hero_editorial"/);
  assert.equal((article.match(/kf-full kf-infographic/g) || []).length, 2);
  assert.match(article, /<link rel="canonical" href="https:\/\/kfarmai\.com\/kb\/2026-basic-public-interest-direct-payment-schedule\.html"/);
  assert.match(article, /official-cta-mafra-2026-direct-payment-v1\.svg/);
  assert.match(article, /official-cta-mafra-2026-income-v1\.svg/);
  assert.match(article, /2027-rural-basic-income-pilot-34-counties-selection\.html/);
});
