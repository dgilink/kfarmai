'use strict';
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function urlsOf(xml) {
  assert.doesNotMatch(xml, /<!DOCTYPE|<!ENTITY/i);
  const parsed = cp.spawnSync('python', ['-c',
    'import sys,json,xml.etree.ElementTree as E; r=E.fromstring(sys.stdin.read()); n="{http://www.sitemaps.org/schemas/sitemap/0.9}"; assert r.tag==n+"urlset"; u=r.findall(n+"url"); assert len(u)==len(r); assert all(len(x.findall(n+"loc"))==1 for x in u); print(json.dumps([x.find(n+"loc").text for x in u]))'
  ], {input: xml, encoding: 'utf8'});
  assert.equal(parsed.status, 0, parsed.stderr);
  const urls = JSON.parse(parsed.stdout);
  assert.ok(urls.length > 0);
  assert.equal(new Set(urls).size, urls.length, 'sitemap URLs must be unique');
  for (const value of urls) {
    const url = new URL(value);
    assert.equal(url.origin, 'https://kfarmai.com');
    assert.equal(url.search + url.hash + url.username + url.password, '');
    assert.doesNotMatch(value, /localhost|127\.0\.0\.1|preview|candidate|private|\/automation\/|\/tests\/|\/docs\/|\/orp/i);
  }
  return urls;
}

function assertSitemap(root, expectedPaths, artifact) {
  const urls = urlsOf(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'automation/daily_registry.json'), 'utf8'));
  for (const url of [...expectedPaths.map(p => `https://kfarmai.com/${p}`), ...registry.items.map(r => r.url)]) {
    assert.ok(urls.includes(url), `expected published URL missing: ${url}`);
  }
  if (artifact) {
    const deployed = urlsOf(fs.readFileSync(path.join(artifact, 'sitemap.xml'), 'utf8'));
    assert.deepEqual(deployed, urls, 'artifact must contain the same sitemap URLs');
  }
  return urls.length;
}
module.exports = {assertSitemap, urlsOf};
