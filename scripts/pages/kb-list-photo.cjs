const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Q2 reviewed presentation photos: these override legacy infographic heroes.
const reviewedPhotos = Object.freeze({
  '/kb/pear-harvest-sorting-cold-storage-five-checks.html': '/static/kb/pear-harvest-sorting-cold-storage-five-checks-photo-20261029.webp',
  '/kb/autumn-rain-wheat-barley-sowing-checklist.html': '/static/kb/autumn-rain-wheat-barley-sowing-checklist-photo-20261029.webp',
  '/kb/autumn-cabbage-october-disease-field-checklist.html': '/static/kb/autumn-cabbage-october-disease-field-checklist-hero.png',
  '/kb/greenhouse-heating-preflight-notes.html': '/static/kb/greenhouse-heating-preflight-notes-hero.webp',
  '/kb/greenhouse-irrigation-precheck.html': '/static/kb/greenhouse-irrigation-precheck-photo-20261029.jpg',
  '/kb/strawberry-winter-light-humidity-check.html': '/static/kb/strawberry-winter-light-humidity-check-hero-20261029.webp',
  '/kb/strawberry-small-smartfarm.html': '/static/kb/strawberry-small-smartfarm-sensor-reference-20261029.webp',
});

function isLocalPhoto(value) {
  return typeof value === 'string' &&
    /^\/static\/kb\/(?:thumbnails\/)?[a-z0-9][a-z0-9-]*\.(?:png|jpe?g|webp)$/.test(value) &&
    !/infographic|diagram|checklist-(?:graphic|chart)/i.test(value);
}

function isRasterFile(root, source) {
  if (!isLocalPhoto(source)) return false;
  const file = path.join(root, source.slice(1));
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) return false;
  const bytes = fs.readFileSync(file);
  if (source.endsWith('.png')) return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (/\.jpe?g$/.test(source)) return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

function selectListPhoto(root, articlePath, html) {
  // Only photo-labelled local media already linked by approved article bytes.
  // Never fetch remote URLs or use an arbitrary first image / infographic.
  const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const candidates = [...markup.matchAll(/<img\b[^>]*>/gi)].flatMap(([tag]) => {
    const source = tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i)?.[1];
    const role = tag.match(/\sdata-media-role\s*=\s*["']([^"']+)["']/i)?.[1];
    const photoRole = role ? ['hero_photo', 'inline_photo'].includes(role) :
      Object.values(reviewedPhotos).includes(source) || /-photo(?:-|\.)/.test(source || '');
    return source && photoRole ? [source] : [];
  });
  const reviewed = reviewedPhotos[articlePath];
  if (reviewed && !isRasterFile(root, reviewed)) throw Error('Reviewed KB photo missing or invalid: ' + articlePath);
  const source = reviewed || candidates.find(value => isRasterFile(root, value));
  if (!source) return '';
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, source.slice(1)))).digest('hex').slice(0, 12);
  const thumb = `/static/kb/thumbnails/${path.basename(source, path.extname(source))}-${hash}.webp`;
  return isRasterFile(root, thumb) ? thumb : source;
}

module.exports = { isLocalPhoto, isRasterFile, selectListPhoto, reviewedPhotos };
