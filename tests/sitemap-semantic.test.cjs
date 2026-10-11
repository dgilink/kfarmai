'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {urlsOf} = require('./sitemap-contract.cjs');
const xml = urls => `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;
test('sitemap count follows valid XML, without a publication count constant', () => {
  for (const count of [1, 3, 11]) {
    const urls = Array.from({length: count}, (_, i) => `https://kfarmai.com/kb/example-${i}.html`);
    assert.deepEqual(urlsOf(xml(urls)), urls);
  }
});
test('invalid XML, duplicate and internal URLs are rejected', () => {
  assert.throws(() => urlsOf('<broken>'));
  assert.throws(() => urlsOf(xml(['https://kfarmai.com/', 'https://kfarmai.com/'])));
  for (const fragment of ['preview', 'candidate', 'private', 'automation']) {
    assert.throws(() => urlsOf(xml([`https://kfarmai.com/${fragment}/x`])));
  }
  assert.throws(() => urlsOf(xml(['https://example.com/'])));
});
