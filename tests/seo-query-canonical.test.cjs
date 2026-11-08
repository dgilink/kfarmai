'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const targets = ['crop-calendar.html','crop-guide.html','agri-weather.html','diagnosis.html'];
for (const file of targets) {
  test('query-state canonical: ' + file, () => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const head = html.split(/<\/head>/i)[0];
    assert.match(head, /<title\b/i);
    const tags = [...head.matchAll(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi)];
    assert.equal(tags.length, 1, 'exactly one canonical');
    assert.match(tags[0][0], new RegExp('href=["\']https:\\/\\/kfarmai\\.com\\/'+file.replace(/\./g,'\\.')+'["\']'));
    assert.doesNotMatch(head, /<meta\b[^>]*\bcontent=["'][^"']*\bnoindex\b/i);
    assert.ok(html.includes('</body>'), 'preserve existing app document');
  });
}
test('sitemap lists path-only URLs', () => {
  const sitemap = fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
  for (const file of targets) assert.ok(sitemap.includes('https://kfarmai.com/'+file), file);
  assert.doesNotMatch(sitemap, /<loc>[^<]*[?&](?:crop|symptom|q)=/i);
});
