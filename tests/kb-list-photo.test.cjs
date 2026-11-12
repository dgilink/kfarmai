const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isLocalPhoto, isRasterFile, selectListPhoto, reviewedPhotos } = require('../scripts/pages/kb-list-photo.cjs');
const repo = path.resolve(__dirname, '..');

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-photo-contract-'));
  fs.mkdirSync(path.join(root, 'static/kb'), { recursive: true });
  fs.copyFileSync(path.join(repo, 'static/kb/greenhouse-irrigation-precheck-photo-20261029.jpg'),
    path.join(root, 'static/kb/new-photo.jpg'));
  try { run(root); } finally { fs.rmSync(root, { recursive: true }); }
}
const select = (root, html) => selectListPhoto(root, '/kb/new-article.html', html);

test('all seven Q2 reviewed photos retain content-addressed lightweight thumbnails', () => {
  for (const article of Object.keys(reviewedPhotos)) {
    const image = selectListPhoto(repo, article, '');
    assert.match(image, /^\/static\/kb\/thumbnails\/.*-[a-f0-9]{12}\.webp$/);
    assert.ok(fs.statSync(path.join(repo, image.slice(1))).size < 40000);
  }
});
test('new approved articles inherit a linked reviewed photo without a new slug map', () => {
  const photo = reviewedPhotos['/kb/autumn-cabbage-october-disease-field-checklist.html'];
  const image = select(repo, `<img src="${photo}"><img src="/static/kb/new-infographic.svg">`);
  assert.match(image, /thumbnails\/autumn-cabbage.*\.webp$/);
});
test('a newly linked local photo is discoverable without a slug allowlist', () => fixture(root => {
  assert.equal(select(root, '<img src="/static/kb/new-photo.jpg">'), '/static/kb/new-photo.jpg');
}));
test('explicit inline photo is used when the hero is an infographic', () => fixture(root => {
  fs.renameSync(path.join(root, 'static/kb/new-photo.jpg'), path.join(root, 'static/kb/new-inline.jpg'));
  assert.equal(select(root, '<img src="/static/kb/chart-infographic.svg"><img data-media-role="inline_photo" src="/static/kb/new-inline.jpg">'), '/static/kb/new-inline.jpg');
}));
test('an image-free legacy article remains text-only', () => fixture(root => {
  assert.equal(select(root, '<h1>Legacy</h1><p>Text</p>'), '');
}));
test('remote photos and infographic-only content are never promoted', () => fixture(root => {
  assert.equal(select(root, '<img src="https://example.com/photo.jpg"><img src="/static/kb/test-infographic.svg">'), '');
}));
test('unclassified hero and explicitly infographic-labelled images stay text-only', () => fixture(root => {
  fs.copyFileSync(path.join(root, 'static/kb/new-photo.jpg'), path.join(root, 'static/kb/new-hero.jpg'));
  assert.equal(select(root, '<img src="/static/kb/new-hero.jpg">'), '');
  assert.equal(select(root, '<img data-media-role="infographic" src="/static/kb/new-photo.jpg">'), '');
}));
test('path traversal, remote, query, SVG and infographic paths are rejected', () => {
  for (const image of ['/static/kb/../private/photo.jpg', '//evil.test/photo.jpg',
    '/static/kb/photo.jpg?token=x', '/static/kb/photo.svg', '/static/kb/photo-infographic.png',
    '/static/kb/%2e%2e/photo.jpg', 'javascript:alert(1)']) assert.equal(isLocalPhoto(image), false);
});
test('missing, zero-byte and non-raster local files fall back without a broken img', () => fixture(root => {
  fs.writeFileSync(path.join(root, 'static/kb/empty-photo.jpg'), '');
  fs.writeFileSync(path.join(root, 'static/kb/html-photo.jpg'), '<html>error</html>');
  for (const name of ['missing', 'empty', 'html']) assert.equal(select(root, `<img src="/static/kb/${name}-photo.jpg">`), '');
}));
test('script strings and data-src attributes are not linked article photos', () => fixture(root => {
  assert.equal(select(root, '<script>const x = `<img src="/static/kb/new-photo.jpg">`;</script>'), '');
  assert.equal(select(root, '<img data-src="/static/kb/new-photo.jpg">'), '');
}));
test('a stale thumbnail filename cannot replace changed photo bytes', () => fixture(root => {
  fs.mkdirSync(path.join(root, 'static/kb/thumbnails'));
  fs.copyFileSync(path.join(root, 'static/kb/new-photo.jpg'), path.join(root, 'static/kb/thumbnails/new-photo-000000000000.webp'));
  assert.equal(select(root, '<img src="/static/kb/new-photo.jpg">'), '/static/kb/new-photo.jpg');
}));
test('a missing reviewed photo fails the build instead of selecting its old infographic hero', () => fixture(root => {
  assert.throws(() => selectListPhoto(root, '/kb/greenhouse-irrigation-precheck.html', ''), /Reviewed KB photo missing/);
}));

test('all November 1 articles use a real local photo for the list and keep reader infographics in the body', () => {
  const slugs = [
    'kimchi-cabbage-heading-problems', 'kimchi-cabbage-harvest-timing',
    'kimchi-radish-harvest-storage', 'late-garlic-planting-winter-care',
    'onion-winter-care-downy-mildew', 'strawberry-gray-mold-powdery-mildew-winter',
    'winter-tomato-condensation-morning-care', 'greenhouse-heating-cost-saving-guide',
    'winter-strawberry-pollination-bees', '2027-organic-agri-input-support',
    'land-based-aquafarm-winter-checklist', 'ras-do-land-based-aquaculture-basics',
  ];
  for (const slug of slugs) {
    const articlePath = `/kb/${slug}.html`;
    const html = fs.readFileSync(path.join(repo, articlePath.slice(1)), 'utf8');
    assert.equal((html.match(/data-media-role="hero_photo"/g) || []).length, 1, slug);
    assert.equal((html.match(/reader-infographic-20261101\.webp/g) || []).length, 1, slug);
    const image = selectListPhoto(repo, articlePath, html);
    assert.match(image, /^\/static\/kb\/thumbnails\/.*-[a-f0-9]{12}\.webp$/, slug);
    assert.doesNotMatch(image, /infographic/, slug);
    assert.ok(isRasterFile(repo, image), slug);
    assert.ok(fs.statSync(path.join(repo, image.slice(1))).size < 40000, slug);
  }
});

test('the additional onion field diagram stays in the article and never becomes a list image', () => {
  const articlePath = '/kb/onion-winter-care-downy-mildew.html';
  const html = fs.readFileSync(path.join(repo, articlePath.slice(1)), 'utf8');
  assert.match(html, /src="\/static\/kb\/onion-winter-care-field-check-20261101\.svg"/);
  assert.match(html, /src="\/static\/kb\/late-garlic-planting-winter-care-reader-infographic-20261101\.webp"/);
  assert.doesNotMatch(selectListPhoto(repo, articlePath, html), /infographic|field-check/);
});


test('same-slug editorial SVG hero appears as list image when explicitly approved', () => fixture(root => {
  const image = '/static/kb/new-article-hero.svg';
  fs.writeFileSync(path.join(root, image.slice(1)),
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="1200" height="675" fill="#563948"/></svg>');
  assert.equal(select(root, '<img data-media-role="hero_editorial" src="' + image + '">'), image);
  assert.equal(select(root, '<img src="' + image + '">'), '');
  assert.equal(select(root, '<img data-media-role="infographic" src="' + image + '">'), '');
  assert.throws(() => select(root, '<img data-media-role="hero_editorial" src="/static/kb/other-hero.svg">'),
    /editorial cover missing or invalid/);
}));
test('active SVG is not eligible for listing even when marked hero_editorial', () => fixture(root => {
  const image = '/static/kb/new-article-hero.svg';
  fs.writeFileSync(path.join(root, image.slice(1)),
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.throws(() => select(root, '<img data-media-role="hero_editorial" src="' + image + '">'),
    /editorial cover missing or invalid/);
}));
