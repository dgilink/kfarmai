const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {selectListPhoto} = require('../scripts/pages/kb-list-photo.cjs');
const root = path.resolve(__dirname, '../automation/approved_batches/20261123-28/content');
const slug = 'jeonbuk-agricultural-meister-2027-course-application';
test('Approved portable photo path resolves to the same local raster for listing', () => {
  const image = `/static/kb/${slug}-photo-1.webp`;
  const html = `<img data-media-role="hero_photo" src="..${image}">`;
  assert.equal(selectListPhoto(root, `/kb/${slug}.html`, html), image);
});
test('Relative traversal and remote images remain excluded', () => {
  for (const src of ['../../static/kb/photo.webp','../static/kb/../../secret.webp','https://example.com/photo.webp']) {
    assert.equal(selectListPhoto(root, `/kb/${slug}.html`, `<img data-media-role="hero_photo" src="${src}">`), '');
  }
});
