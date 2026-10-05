'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mfg = fs.readFileSync(path.join(root, 'mfg.html'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'seed.html'), 'utf8');
const santoPage = fs.readFileSync(path.join(root, 'santo.html'), 'utf8');
const fert = fs.readFileSync(path.join(root, 'fert.html'), 'utf8');
const cpa = fs.readFileSync(path.join(root, 'cpa.html'), 'utf8');
const santo = fs.readFileSync(path.join(root, 'static/santo_data.js'), 'utf8');
const { normalizeExternalHomepage: normalize } = require('../static/js/external-homepage.js');
const linkCount = value => normalize(value) ? 1 : 0;

let passed = 0;
function test(name, callback) {
  try { callback(); passed += 1; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

test('https homepage remains linkable', () => assert.equal(linkCount('https://example.com'), 1));
test('http homepage remains linkable', () => assert.equal(linkCount('http://example.com'), 1));
test('unknown sentinel is not linkable', () => assert.equal(linkCount('미확인'), 0));
test('none sentinel is not linkable', () => assert.equal(linkCount('없음'), 0));
test('dash sentinel is not linkable', () => assert.equal(linkCount('-'), 0));
test('empty and whitespace values are not linkable', () => { assert.equal(linkCount(''), 0); assert.equal(linkCount('   '), 0); });
test('null and undefined are not linkable', () => { assert.equal(linkCount(null), 0); assert.equal(linkCount(undefined), 0); });
test('javascript URLs are not linkable', () => assert.equal(linkCount('javascript:alert(1)'), 0));
test('data URLs are not linkable', () => assert.equal(linkCount('data:text/html,<h1>x</h1>'), 0));
test('relative paths are not linkable', () => assert.equal(linkCount('relative/path'), 0));
test('malformed absolute URLs are not linkable', () => assert.equal(linkCount('https://'), 0));
test('known company homepage remains an external HTTP URL', () => assert.equal(normalize('http://www.gungon.co.kr'), 'http://www.gungon.co.kr'));
test('bare domains are normalized to safe HTTPS URLs', () => {
  assert.equal(normalize('kaplug.co.kr'), 'https://kaplug.co.kr');
  assert.equal(normalize('www.kaplug.co.kr'), 'https://www.kaplug.co.kr');
  assert.equal(normalize('example.com/path'), 'https://example.com/path');
});
test('absolute homepage URLs remain unchanged', () => assert.equal(normalize('https://kaplug.co.kr'), 'https://kaplug.co.kr'));
test('renderer uses only the normalized homepage', () => {
  for (const page of [mfg, seed, santoPage, fert, cpa]) {
    assert.match(page, /const homepage = window\.KFExternalLinks\.normalizeExternalHomepage\(item\.homepage\)/);
    assert.match(page, /const hp = homepage[\s\S]{0,80}<a href="\$\{homepage\}"/);
    assert.doesNotMatch(page, /href="\$\{item\.homepage\}"/);
  }
});
test('unknown source value is preserved but never becomes a broken href', () => {
  assert.match(santo, /"homepage": "미확인"/);
  assert.equal(linkCount('미확인'), 0);
  assert.doesNotMatch(mfg, /href=["'`]\/?미확인/);
});
test('all company homepage data obeys the normalization contract', () => {
  const files = ['static/santo_data.js', 'static/seed_data.js', 'static/cpa_data.js', 'static/fert_data.js'];
  const values = files.flatMap(file => [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(/"?homepage"?\s*:\s*"([^"]*)"/g)].map(match => match[1]));
  assert.equal(values.length, 119);
  assert.equal(values.filter(value => value === 'kaplug.co.kr').length, 1);
  for (const value of values) {
    const normalized = normalize(value);
    if (!value.trim() || ['미확인', '없음', '-'].includes(value.trim())) assert.equal(normalized, null, value);
    else assert.match(normalized, /^https?:\/\//, value);
  }
});

process.stdout.write(`Phase 5D-2D Pages gate contracts: ${passed}/${passed} PASS\n`);
