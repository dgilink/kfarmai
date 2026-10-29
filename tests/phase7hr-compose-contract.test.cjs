'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

for (const name of ['index.html', 'channel.html', 'post.html']) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [, attributes, source] of scripts) {
    if (!source.trim() || /type\s*=\s*["']application\/ld\+json/i.test(attributes)) continue;
    new vm.Script(source, { filename: name });
  }
  assert.match(html, /compose-draft\.js\?v=phase7h-r2-empty-restore/);
  assert.match(html, /secure-image-upload\.js\?v=phase7h-r1/);
  assert.doesNotMatch(html, /storage\.from\(['"]post-images['"]\)\.upload\(/);
  assert.match(html, /clearAfterSuccess/);
}
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const channel = fs.readFileSync(path.join(root, 'channel.html'), 'utf8');
const post = fs.readFileSync(path.join(root, 'post.html'), 'utf8');
for (const source of [index, channel]) {
  assert.match(source, /composeDraft\.upload\(/);
  assert.match(source, /composeDraft\.reconcile\(/);
  assert.match(source, /beginSubmission\(payload\)/);
}
assert.match(post, /editDraft\.upload\(/);
const draft = fs.readFileSync(path.join(root, 'static/js/community/compose-draft.js'), 'utf8');
new vm.Script(draft, { filename: 'compose-draft.js' });
assert.match(draft, /indexedDB\.open/);
assert.match(draft, /SHA-256/);
assert.match(draft, /beforeunload/);
assert.match(draft, /hasRestorableContent/);
console.log('PHASE7HR_COMPOSE_CONTRACT_PASS');
