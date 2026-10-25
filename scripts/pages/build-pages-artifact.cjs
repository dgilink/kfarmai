const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputDir = path.resolve(repoRoot, outputArg ? outputArg.slice('--output='.length) : '_site');
const crypto = require('node:crypto');

// V4 presentation v1 changes only the deployed copy. Approved source bytes and
// registry html_sha256 remain immutable; the audit verifies this exact transform.
const kbPresentationV1 = Buffer.from('<link rel="stylesheet" href="/static/css/v4-shell.css" data-kfarmai-presentation="v4-1"><script src="/static/js/v4-shell.js" defer data-kfarmai-presentation="v4-1"></script>');
function renderKbV4(source) {
  const marker = Buffer.from('</head>');
  const at = source.indexOf(marker);
  if (at < 0 || source.indexOf(marker, at + marker.length) >= 0 || source.includes(kbPresentationV1)) {
    throw new Error('KB presentation source has no unique head boundary.');
  }
  return Buffer.concat([source.subarray(0, at), kbPresentationV1, source.subarray(at)]);
}

const publicRootFiles = new Set([
  '.nojekyll',
  'CNAME',
  'robots.txt',
  'sitemap.xml',
  'style.css',
]);

const publicDirectories = new Map([
  ['static', new Set(['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf'])],
  ['data', new Set(['.json'])],
  ['kb', new Set(['.html'])],
  ['q', new Set(['.html'])],
  ['oauth', new Set(['.html'])],
]);

function assertSafeOutput(target) {
  const parsed = path.parse(target);
  if (target === repoRoot || target === parsed.root) {
    throw new Error('Refusing to replace an unsafe artifact path.');
  }

  const relative = path.relative(repoRoot, target);
  const isRepoSite = relative === '_site';
  const isDedicatedTemp = path.basename(target).startsWith('kfarmai-pages-artifact-');
  if (!isRepoSite && !isDedicatedTemp) {
    throw new Error('Artifact output must be repo/_site or a dedicated kfarmai-pages-artifact-* directory.');
  }
}

function copyFile(relativePath) {
  const source = path.join(repoRoot, relativePath);
  const destination = path.join(outputDir, relativePath);
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Public allowlist contains a non-regular file: ${relativePath}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function walkFiles(directory, allowedExtensions, relativeBase = directory) {
  const absoluteDirectory = path.join(repoRoot, relativeBase);
  if (!fs.existsSync(absoluteDirectory)) {
    throw new Error(`Required public directory is missing: ${relativeBase}`);
  }

  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeBase.replaceAll('\\', '/'), entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symlinks are not allowed in the Pages artifact: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      walkFiles(directory, allowedExtensions, relativePath);
      continue;
    }
    if (entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
      copyFile(relativePath);
    }
  }
}

assertSafeOutput(outputDir);
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (entry.name.endsWith('.html') || publicRootFiles.has(entry.name)) {
    copyFile(entry.name);
  }
}

for (const [directory, extensions] of publicDirectories) {
  walkFiles(directory, extensions);
}

// The private operational registry is never published. Emit only a minimal,
// reviewed-content discovery projection after verifying local article paths.
const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'automation/daily_registry.json'), 'utf8'));
if (!Array.isArray(registry.items)) throw new Error('Invalid KB registry.');
const kbItems = registry.items.map((item) => {
  const slug = String(item.slug || '');
  const date = String(item.date || '');
  if (!/^[a-z0-9-]+$/.test(slug) || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || item.url !== `https://kfarmai.com/kb/${slug}.html`
      || !fs.existsSync(path.join(outputDir, 'kb', `${slug}.html`))) {
    throw new Error('KB registry entry is not a published local article.');
  }
  if (item.html_sha256) {
    let source = fs.readFileSync(path.join(repoRoot, 'kb', `${slug}.html`));
    let hash = crypto.createHash('sha256').update(source).digest('hex');
    // Windows text checkout can add CRLF to an approved Git blob. Only restore
    // its canonical LF bytes when the registry hash proves they are identical.
    if (hash !== item.html_sha256) {
      const canonical = Buffer.from(source.toString('utf8').replace(/\r\n/g, '\n'));
      if (crypto.createHash('sha256').update(canonical).digest('hex') === item.html_sha256) {
        source = canonical;
        hash = item.html_sha256;
      }
    }
    if (hash !== item.html_sha256) throw new Error(`Approved KB source hash mismatch: ${slug}`);
    fs.writeFileSync(path.join(outputDir, 'kb', `${slug}.html`), source);
  }
  return { title: String(item.title || ''), category: String(item.category || ''),
    date, path: `/kb/${slug}.html` };
}).sort((a, b) => b.date.localeCompare(a.date));
for (const entry of fs.readdirSync(path.join(outputDir, 'kb'), { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.html') || entry.name === 'index.html') continue;
  const destination = path.join(outputDir, 'kb', entry.name);
  fs.writeFileSync(destination, renderKbV4(fs.readFileSync(destination)));
}
fs.writeFileSync(path.join(outputDir, 'data/kb-index.json'),
  `${JSON.stringify({items: kbItems})}\n`, 'utf8');

// Render the already-approved registry projection into the public home copy.
// This avoids a late client-side card replacement becoming the LCP element.
// The source home file and every approved KB article remain byte-identical.
const homePath = path.join(outputDir, 'index.html');
const homeSource = fs.readFileSync(homePath, 'utf8');
const homeStart = '<div class="home-kb-cards" id="homeKbCards" aria-live="polite">';
const startAt = homeSource.indexOf(homeStart);
if (startAt < 0 || homeSource.indexOf(homeStart, startAt + homeStart.length) >= 0) {
  throw new Error('Home KB card boundary is not unique.');
}
const endAt = homeSource.indexOf('</div>', startAt + homeStart.length);
if (endAt < 0) throw new Error('Home KB card boundary is incomplete.');
const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
// The home lead may use only media already declared by an approved public article.
// No image is invented for NO_IMAGE content.
const homeLeadMedia = Object.freeze({
  '/kb/greenhouse-heating-preflight-notes.html': '/static/kb/greenhouse-heating-preflight-notes-hero.webp',
});
// Keep a local, rights-verified hero early in the editorial home sequence.
// Articles without a local image remain valid text cards rather than loading a new external image.
const homeItems = [...kbItems].sort((a, b) =>
  Number(Boolean(homeLeadMedia[b.path])) - Number(Boolean(homeLeadMedia[a.path])) || b.date.localeCompare(a.date));
const cards = homeItems.slice(0, 4).map(item => {
  const meta = `<small>${escapeHtml(item.category)} · ${item.date} · 공식 출처는 글에서 확인</small>`;
  const title = `<strong>${escapeHtml(item.title)}</strong>`;
  const image = homeLeadMedia[item.path];
  return `<a class="kb-card" href="${item.path}">${image
    ? `<img src="${image}" alt="" loading="eager" decoding="async"><span class="v41-kb-copy">${meta}${title}</span>`
    : `${meta}${title}<span>내용과 출처 확인 →</span>`}</a>`;
}).join('');
fs.writeFileSync(homePath,
  `${homeSource.slice(0, startAt)}<div class="home-kb-cards" id="homeKbCards" aria-live="polite" data-kb-static="1">${cards}${homeSource.slice(endAt)}`,
  'utf8');

function countFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(
    (count, entry) => count + (entry.isDirectory() ? countFiles(path.join(directory, entry.name)) : 1),
    0,
  );
}

console.log(`Pages artifact built from explicit public allowlist: ${countFiles(outputDir)} files.`);
