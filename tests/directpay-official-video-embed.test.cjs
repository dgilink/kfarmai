'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const article = fs.readFileSync(path.join(__dirname, '..', 'kb/2026-basic-public-interest-direct-payment-schedule.html'), 'utf8');
test('official NAQS video is embedded exactly once in the relevant article section', () => {
  assert.equal(article.split('<iframe').length - 1, 1);
  assert.match(article, /src="https:\/\/www\.youtube-nocookie\.com\/embed\/L7nlcr6RciM"/);
  assert.match(article, /title="국립농산물품질관리원 공식 영상:/);
  assert.match(article, /class="kf-video-frame"/);
  assert.match(article, /aspect-ratio:16\/9/);
  assert.match(article, /loading="lazy"/);
  assert.match(article, /referrerpolicy="strict-origin-when-cross-origin"/);
  assert.match(article, /2024년 7월 30일/);
  assert.match(article, /2026년 지급일이나 변경된 농외소득 기준을 안내하는 영상은 아니므로/);
  assert.doesNotMatch(article, /autoplay=1/);
  assert.match(article, /href="https:\/\/www\.youtube\.com\/watch\?v=L7nlcr6RciM"/);
});
test('previous article media, canonical and official source badges are retained', () => {
  assert.match(article, /data-media-role="hero_editorial"/);
  assert.equal((article.match(/kf-full kf-infographic/g) || []).length, 2);
  assert.match(article, /<link rel="canonical" href="https:\/\/kfarmai\.com\/kb\/2026-basic-public-interest-direct-payment-schedule\.html"/);
  assert.match(article, /official-cta-mafra-2026-direct-payment-v1\.svg/);
  assert.match(article, /official-cta-mafra-2026-income-v1\.svg/);
});
