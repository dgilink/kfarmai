const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

function publicFileFor(url) {
  const relative = new URL(url).pathname.replace(/^\//, '');
  const candidates = !relative
    ? ['index.html']
    : relative.endsWith('/')
      ? [`${relative}index.html`]
      : path.extname(relative)
        ? [relative]
        : [relative, `${relative}.html`];
  return candidates.map((candidate) => path.join(root, candidate)).find(fs.existsSync);
}

test('sitemap is a well-formed public URL set', () => {
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.ok(urls.length >= 180);
  assert.equal(new Set(urls).size, urls.length);
  urls.forEach((url) => assert.match(url, /^https:\/\/kfarmai\.com\//));
  assert.doesNotMatch(sitemap, /(?:preview|candidate|private|draft|localhost|127\.0\.0\.1|noindex)/i);
});

test('every sitemap route resolves to a public source file', () => {
  for (const url of urls) assert.ok(publicFileFor(url), url);
});

test('the two post-180 approved knowledge articles are public and indexable', () => {
  for (const relative of [
    'kb/strawberry-small-smartfarm.html',
    'kb/autumn-cabbage-october-disease-field-checklist.html',
  ]) {
    const url = `https://kfarmai.com/${relative}`;
    assert.equal(urls.filter((item) => item === url).length, 1, url);
    const html = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(html, new RegExp(`<link rel="canonical" href="${url.replaceAll('.', '\\.')}">`));
    assert.doesNotMatch(html, /<meta[^>]+name="robots"[^>]+noindex/i);
  }
});
