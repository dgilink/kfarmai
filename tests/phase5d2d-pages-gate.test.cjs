'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const mfg = fs.readFileSync(path.join(root, 'mfg.html'), 'utf8');
const santo = fs.readFileSync(path.join(root, 'static/santo_data.js'), 'utf8');
const start = mfg.indexOf('function normalizeExternalHttpUrl');
const end = mfg.indexOf('function renderCards', start);
assert.ok(start >= 0 && end > start, 'homepage validator source must be extractable');
const sandbox = { URL };
vm.runInNewContext(`${mfg.slice(start, end)}\nresult = normalizeExternalHttpUrl;`, sandbox);
const normalize = sandbox.result;
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
test('known company homepage remains an external HTTP URL', () => assert.equal(normalize('http://www.gungon.co.kr'), 'http://www.gungon.co.kr/'));
test('renderer uses only the normalized homepage', () => {
  assert.match(mfg, /const homepage = normalizeExternalHttpUrl\(item\.homepage\)/);
  assert.match(mfg, /const hp = homepage \? `<a href="\$\{homepage\}"/);
  assert.doesNotMatch(mfg, /href="\$\{item\.homepage\}"/);
});
test('unknown source value is preserved but never becomes a broken href', () => {
  assert.match(santo, /"homepage": "미확인"/);
  assert.equal(linkCount('미확인'), 0);
  assert.doesNotMatch(mfg, /href=["'`]\/?미확인/);
});

process.stdout.write(`Phase 5D-2D Pages gate contracts: ${passed}/${passed} PASS\n`);
