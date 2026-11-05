'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const artifact = path.join(root, '_site');
const home = fs.readFileSync(path.join(artifact, 'index.html'), 'utf8');
const list = fs.readFileSync(path.join(artifact, 'kb/index.html'), 'utf8');
const registry = JSON.parse(fs.readFileSync(path.join(artifact, 'data/kb-index.json'), 'utf8'));
const sourceHome = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const channel = fs.readFileSync(path.join(root, 'channel.html'), 'utf8');
const homeBlock = home.match(/<div class="home-kb-cards"[^>]*>([\s\S]*?)<\/div>/)?.[1];
assert.ok(homeBlock, 'generated home card block');
const cards = [...homeBlock.matchAll(/<a class="kb-card[^>]*>([\s\S]*?)<\/a>/g)];
assert.equal(cards.length, 4);
for (const [index, match] of cards.entries()) {
  const image = match[1].match(/<img\b[^>]*>/)?.[0];
  if (!image) continue;
  assert.match(image, new RegExp(`loading="${index === 0 ? 'eager' : 'lazy'}"`));
  assert.equal(image.includes('fetchpriority="high"'), index === 0);
  const original = registry.items[index].image;
  if (original?.startsWith('https://commons.wikimedia.org/')) {
    assert.match(original, /\?width=1280$/);
    assert.ok(image.includes(original.replace('?width=1280', '?width=320')));
  }
}
assert.match(list, /commons\.wikimedia\.org[^"<]+\?width=320/);
assert.match(sourceHome, /const imageLoading=index===0\?'eager':'lazy'/);
assert.match(channel, /const thumbLoading=index===0\?'eager':'lazy'/);
assert.doesNotMatch(sourceHome, /const imagePriority=index<2/);
assert.doesNotMatch(channel, /const thumbPriority=index<2/);
process.stdout.write('V4 mobile loading: 4 cards, source approvals and thumbnail priority PASS\n');
