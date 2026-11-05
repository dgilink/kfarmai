'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = ['kb/index.html'];
if (fs.existsSync(path.join(root, '_site/kb/index.html'))) pages.push('_site/kb/index.html');
for (const name of pages) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  assert.doesNotMatch(html, /class="kb-index-lead"/);
  assert.match(html, /<details class="kb-series-block" id="series">\s*<summary class="kb-section-head">/);
  assert.match(html, /class="kb-series-toggle" aria-hidden="true"><span class="when-closed">펼치기 ↓<\/span><span class="when-open">접기 ↑<\/span>/);
  assert.match(html, /kb-series\.css\?v=20261105-toggle2/);
  assert.match(html, /<\/summary>\s*<div class="kb-series-grid">/);
  assert.match(html, /<\/div>\s*<\/details>\s*<section class="kb-latest-block"/);
  assert.equal((html.match(/class="kb-series-card"/g) || []).length, 4);
}
const js = fs.readFileSync(path.join(root, 'static/js/kb-discovery.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'static/css/kb-series.css'), 'utf8');
assert.match(css, /\.kb-series-block:not\(\[open\]\)\{padding-bottom:0;border:0\}/);
assert.match(js, /location\.hash === '#series'\) series\.open = true/);
assert.match(js, /addEventListener\('hashchange', openLinkedSeries\)/);
process.stdout.write('KB series: collapsed by default, native toggle, deep link and four links PASS\n');
