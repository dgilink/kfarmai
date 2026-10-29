const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputDir = path.resolve(repoRoot, outputArg ? outputArg.slice('--output='.length) : '_site');
const crypto = require('node:crypto');

// V4 presentation v1 changes only the deployed copy. Approved source bytes and
// registry html_sha256 remain immutable; the audit verifies this exact transform.
// Version the shared presentation bundle from its bytes. Static assets are
// cached for hours, so a release must change the URL whenever any shell or
// agriculture-feed UI source changes.
const shellVersion = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(repoRoot, 'static/css/v4-shell.css')))
  .update(fs.readFileSync(path.join(repoRoot, 'static/js/v4-shell.js')))
  .update(fs.readFileSync(path.join(repoRoot, 'static/js/agri-info/agri-feed-ui.js')))
  .update(fs.readFileSync(path.join(repoRoot, 'static/js/kb-discovery.js')))
  .digest('hex').slice(0, 16);
const firstPaintHead = '<meta name="theme-color" content="#ffffff" data-v4-theme="light"><meta name="color-scheme" content="light"><style data-v4-first-paint>html,body{background:#fff!important;color-scheme:light}body.v4-global-header-ready{min-width:320px}</style>';
const kbPresentationV1 = Buffer.from('<link rel="stylesheet" href="/static/css/v4-shell.css?v=' + shellVersion + '" data-kfarmai-presentation="v4-1"><script src="/static/js/v4-shell.js?v=' + shellVersion + '" defer data-kfarmai-presentation="v4-1"></script>');

// Preserve original, approved HTML and its SHA-256 in Git. Changes below apply
// ONLY to the generated public artifact; immutable approval source stays intact.
// Revised SVGs have versioned filenames, preserving approved original assets.
const approvedVisualRestyles = new Set([
  'greenhouse-irrigation-precheck.html',
  'greenhouse-heating-preflight-notes.html',
  'strawberry-winter-light-humidity-check.html',
  'strawberry-small-smartfarm.html',
]);
function replaceVisualOnce(text, before, after, label) {
  if (text.indexOf(before) < 0 || text.indexOf(before) !== text.lastIndexOf(before)) {
    throw new Error('Non-unique approved presentation anchor: ' + label);
  }
  return text.replace(before, after);
}
function renderApprovedVisualRestyle(buffer, name) {
  if (!approvedVisualRestyles.has(name)) return buffer;
  let html = buffer.toString('utf8');
  const css = '<link rel="stylesheet" href="/static/css/kf-article-media-fullbleed-v20261028.css">';
  if (name === 'greenhouse-irrigation-precheck.html') {
    html = replaceVisualOnce(html,
      '<img src="/static/kb/greenhouse-irrigation-precheck-hero.webp" alt="온실 관수 설비 점검 항목 안내 이미지">',
      '<figure class="kf-full-media"><img src="/static/kb/greenhouse-irrigation-precheck-photo-20261029.jpg" alt="온실 내부 관수 장치 사진" loading="eager"></figure>',
      'irrigation hero');
    html = replaceVisualOnce(html,
      '<img src="/static/kb/greenhouse-irrigation-precheck-infographic.svg" alt="관수 전 세 단계 확인 포인트">',
      '',
      'irrigation infographic');
    html = replaceVisualOnce(html, '<main><article>',
      '<main><article class="knowledge-article">', 'irrigation article');
    html = replaceVisualOnce(html, '<body><main>',
      '<body><header class="site-header"><a href="/index.html">kFarmAI</a></header><main>', 'irrigation header');
    html = replaceVisualOnce(html, '</head>',
      '<link rel="stylesheet" href="/static/css/knowledge-v3.css">' + css + '</head>',
      'irrigation head');
  } else if (name === 'greenhouse-heating-preflight-notes.html') {
    if (html.split('<figure>').length !== 3) throw new Error('Unexpected approved heating figures');
    html = html.replaceAll('<figure>', '<figure class="kf-full-media">');
    html = replaceVisualOnce(html,
      '<figcaption>온실 참고 사진: USDAgov/Holly Hess, 미국 연방정부 퍼블릭 도메인. 한국 현장 진단 증거가 아닙니다.</figcaption>',
      '', 'heating long hero caption');
    html = replaceVisualOnce(html,
      '<figcaption>겨울철 온실 난방 전 점검 포인트</figcaption>',
      '', 'heating infographic caption');
    html = replaceVisualOnce(html,
      'src="/static/kb/greenhouse-heating-preflight-notes-infographic.svg"',
      'src="/static/kb/greenhouse-heating-preflight-notes-infographic-restyle-20261028.svg"',
      'heating infographic');
    html = replaceVisualOnce(html,
      '최근 확인: 2026-10-19. 공공자료와 kFarmAI 정리 내용을 구분해 작성했습니다.',
      '자료 확인: 2026-10-19 · 사진: USDAgov/Holly Hess (PD).',
      'heating provenance');
    html = replaceVisualOnce(html, '</head>', css + '</head>', 'heating head');
  } else if (name === 'strawberry-winter-light-humidity-check.html') {
    const oldPhoto = 'https://commons.wikimedia.org/wiki/Special:FilePath/Keepsake_Strawberry_by_USDA_(20210216-ARS-LSC-0004).jpg?width=1280';
    const localPhoto = 'https://kfarmai.com/static/kb/strawberry-winter-light-humidity-check-hero-20261029.webp';
    if (html.split(oldPhoto).length !== 4) throw new Error('Unexpected approved strawberry photo anchors');
    html = html.replaceAll(oldPhoto, localPhoto);
    html = replaceVisualOnce(html,
      `src="${localPhoto}" alt="딸기 재배 온실의 실제 식물과 재배 시설"`,
      'src="/static/kb/strawberry-winter-light-humidity-check-hero-20261029.webp" alt="국내 딸기 시설재배 환경을 참고한 대표 이미지"',
      'strawberry local hero');
    html = replaceVisualOnce(html,
      '<li><a href="https://commons.wikimedia.org/wiki/File:Keepsake_Strawberry_by_USDA_(20210216-ARS-LSC-0004).jpg" target="_blank" rel="noopener noreferrer">온실 사진: USDA/ARS, 공개 이미지</a></li>',
      '', 'strawberry retired photo credit');
  } else if (name === 'strawberry-small-smartfarm.html') {
    html = replaceVisualOnce(html,
      '원문 사진·도표·첨부 이미지는 사용하지 않았습니다.</p></div>',
      '원문 사진·도표·첨부 이미지는 사용하지 않았습니다.</p></div><figure><img src="/static/kb/strawberry-small-smartfarm-sensor-reference-20261029.webp" alt="딸기 온실 환경 센서와 관수 제어장치 AI 생성 참고 이미지" loading="eager" decoding="async"><figcaption>AI 생성 참고 이미지 · 특정 실증 농가의 사진이 아닙니다.</figcaption></figure>',
      'smartfarm reference image');
  }
  return Buffer.from(html, 'utf8');
}
function renderKbV4(source, name) {
  const marker = Buffer.from('</head>');
  const at = source.indexOf(marker);
  if (at < 0 || source.indexOf(marker, at + marker.length) >= 0 || source.includes(kbPresentationV1)) {
    throw new Error('KB presentation source has no unique head boundary.');
  }
  const render = Buffer.concat([source.subarray(0, at), kbPresentationV1, source.subarray(at)]);
  return renderApprovedVisualRestyle(render, name);
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
  fs.writeFileSync(destination, renderKbV4(fs.readFileSync(destination), entry.name));
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

// Generate the KB listing from the *verified approved registry*, not from
// hand-written fallback cards. All rows have the exact same 2/3-column DOM
// structure before JS loads, including the newest article and text-only rows.
const kbIndexPath = path.join(outputDir, 'kb', 'index.html');
const kbIndexSource = fs.readFileSync(kbIndexPath, 'utf8');
const kbIndexStart = '<div id="kbGrid" class="kb-grid" aria-live="polite">';
const kbStartAt = kbIndexSource.indexOf(kbIndexStart);
if (kbStartAt < 0 || kbIndexSource.indexOf(kbIndexStart, kbStartAt + kbIndexStart.length) >= 0) {
  throw new Error('KB index listing boundary is not unique.');
}
const kbEndAt = kbIndexSource.indexOf('</div>', kbStartAt + kbIndexStart.length);
if (kbEndAt < 0) throw new Error('KB index listing boundary is incomplete.');
// Media is limited to reviewed local public article assets.
const kbListMedia = Object.freeze({
  '/kb/pear-harvest-sorting-cold-storage-five-checks.html': '/static/kb/pear-harvest-sorting-cold-storage-five-checks-photo-20261029.webp',
  '/kb/autumn-rain-wheat-barley-sowing-checklist.html': '/static/kb/autumn-rain-wheat-barley-sowing-checklist-photo-20261029.webp',
  '/kb/autumn-cabbage-october-disease-field-checklist.html': '/static/kb/autumn-cabbage-october-disease-field-checklist-hero.png',
  '/kb/greenhouse-heating-preflight-notes.html': '/static/kb/greenhouse-heating-preflight-notes-hero.webp',
  // CC0 1.0 photo: Alabama Extension / Bruce Dupree, via Wikimedia Commons,
  // File:Irrigation in a Greenhouse.jpg. Used only as the compact list photo.
  '/kb/greenhouse-irrigation-precheck.html': '/static/kb/greenhouse-irrigation-precheck-photo-20261029.jpg',
  '/kb/strawberry-winter-light-humidity-check.html': '/static/kb/strawberry-winter-light-humidity-check-hero-20261029.webp',
  '/kb/strawberry-small-smartfarm.html': '/static/kb/strawberry-small-smartfarm-sensor-reference-20261029.webp',
});
const kbTopicKey = category => String(category || '').includes('재배노하우') ? '재배노하우' : String(category || '');
const kbIndexCards = kbItems.map((item, index) => {
  const image = kbListMedia[item.path];
  if (image && !fs.existsSync(path.join(outputDir, image.slice(1)))) {
    throw new Error('Approved KB list image missing: ' + image);
  }
  const thumb = image ? '<img class="kb-list-thumb" src="' + image +
    '" alt="" width="92" height="62" loading="eager" fetchpriority="high" decoding="sync">' : '';
  const copy = '<span class="kb-list-copy"><small>' + escapeHtml(item.category) + ' · ' + item.date +
    '</small><strong>' + escapeHtml(item.title) + '</strong></span>';
  return '<a class="kb-card' + (image ? '' : ' is-text-only') +
    '" data-topic="' + escapeHtml(kbTopicKey(item.category)) + '" href="' + item.path + '">' + thumb + copy +
    '<span class="kb-list-arrow" aria-hidden="true">›</span></a>';
}).join('\n      ');
const kbIndexStaticStart = kbIndexStart.slice(0, -1) + ' data-kb-static="1">';
fs.writeFileSync(kbIndexPath, kbIndexSource.slice(0, kbStartAt) +
  kbIndexStaticStart + '\n      ' + kbIndexCards + '\n    ' +
  kbIndexSource.slice(kbEndAt), 'utf8');

// Topic badges are generated from the same verified registry projection as the
// list, so newly approved categories appear without a hand-maintained select.
const kbTopicsStart = '<div id="kbTopics" class="kb-topics" aria-label="농업정보 주제 선택">';
const kbIndexWithCards = fs.readFileSync(kbIndexPath, 'utf8');
const kbTopicsAt = kbIndexWithCards.indexOf(kbTopicsStart);
if (kbTopicsAt < 0 || kbIndexWithCards.indexOf(kbTopicsStart, kbTopicsAt + kbTopicsStart.length) >= 0) {
  throw new Error('KB topic badge boundary is not unique.');
}
const kbTopicsEnd = kbIndexWithCards.indexOf('</div>', kbTopicsAt + kbTopicsStart.length);
if (kbTopicsEnd < 0) throw new Error('KB topic badge boundary is incomplete.');
const kbTopicNames = [...new Set(kbItems.map(item => kbTopicKey(item.category)).filter(Boolean))].sort();
const kbTopicButtons = [['', '전체'], ...kbTopicNames.map(name => [name, name])]
  .map(([value, label], index) => '<button class="kb-topic" type="button" data-category="' +
    escapeHtml(value) + '" aria-pressed="' + (index === 0 ? 'true' : 'false') + '">' +
    escapeHtml(label) + '</button>').join('\n      ');
fs.writeFileSync(kbIndexPath, kbIndexWithCards.slice(0, kbTopicsAt) + kbTopicsStart +
  '\n      ' + kbTopicButtons + '\n    ' + kbIndexWithCards.slice(kbTopicsEnd), 'utf8');

// Home follows the same newest-first registry order and compact thumbnail system.
const homeItems = [...kbItems];
const cards = homeItems.slice(0, 4).map(item => {
  const meta = `<small>${escapeHtml(item.category)} · ${item.date}</small>`;
  const title = `<strong>${escapeHtml(item.title)}</strong>`;
  const image = kbListMedia[item.path];
  return `<a class="kb-card${image ? '' : ' is-text-only'}" data-topic="${escapeHtml(kbTopicKey(item.category))}" href="${item.path}">${image
    ? `<img class="kb-list-thumb" src="${image}" alt="" width="92" height="62" loading="eager" fetchpriority="high" decoding="sync">`
    : ''}<span class="kb-list-copy">${meta}${title}</span><span class="kb-list-arrow" aria-hidden="true">›</span></a>`;
}).join('');
fs.writeFileSync(homePath,
  `${homeSource.slice(0, startAt)}<div class="home-kb-cards" id="homeKbCards" aria-live="polite" data-kb-static="1">${cards}${homeSource.slice(endAt)}`,
  'utf8');

// Every public screen receives the same fixed text header and search route.
// Existing pages may already reference the shell; normalize their cache key
// instead of adding duplicate assets. Approved KB source bytes remain unchanged
// because this runs only against the generated Pages artifact.
const shellCssHref = `/static/css/v4-shell.css?v=${shellVersion}`;
const shellJsSrc = `/static/js/v4-shell.js?v=${shellVersion}`;
const agriFeedUiSrc = `/static/js/agri-info/agri-feed-ui.js?v=${shellVersion}`;
const kbDiscoverySrc = `/static/js/kb-discovery.js?v=${shellVersion}`;
const shellIcon = paths => `<svg class="v4-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const searchIcon = shellIcon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');
const accountIcon = shellIcon('<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.7-4 3.1-6 7.5-6s6.8 2 7.5 6"/>');
function addBodyClasses(html, classes) {
  return html.replace(/<body\b([^>]*)>/i, (match, attributes) => {
    if (/\bclass\s*=\s*["']/i.test(attributes)) {
      return match.replace(/\bclass\s*=\s*(["'])(.*?)\1/i, (classMatch, quote, value) => {
        const merged = [...new Set([...value.split(/\s+/).filter(Boolean), ...classes])].join(' ');
        return `class=${quote}${merged}${quote}`;
      });
    }
    return `<body${attributes} class="${classes.join(' ')}">`;
  });
}
function globalHeaderHtml(isHome) {
  const search = isHome ? '' : `<a class="v4-global-action v4-global-search-action" href="/index.html?focus=search" aria-label="검색">${searchIcon}</a>`;
  return `<header class="v4-global-header" data-v4-global-header><div class="v4-global-header-inner"><a class="v4-global-brand" href="/index.html" aria-label="kFarmAI 홈">kFarmAI</a><nav class="v4-global-actions" aria-label="빠른 메뉴">${search}<a class="v4-global-action" href="/index.html?panel=my" aria-label="계정">${accountIcon}</a></nav></div></header>`;
}
function applyGlobalShellToHtml(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  // Search-engine ownership verification files use an .html suffix but are not
  // documents or screens and must remain byte-minimal.
  if (!/<\/head>/i.test(html)) return;
  html = html
    .replace(/<meta\s+name=["']theme-color["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']color-scheme["'][^>]*>/gi, '')
    .replace(/\/?static\/css\/v4-shell\.css\?v=[^"']+/g, shellCssHref)
    .replace(/\/?static\/js\/v4-shell\.js\?v=[^"']+/g, shellJsSrc)
    .replace(/\/?static\/js\/agri-info\/agri-feed-ui\.js(?:\?v=[^"']*)?/g, agriFeedUiSrc)
    .replace(/\/?static\/js\/kb-discovery\.js(?:\?v=[^"']*)?/g, kbDiscoverySrc);
  const assets = [];
  if (!/static\/css\/v4-shell\.css/i.test(html)) {
    assets.push(`<link rel="stylesheet" href="${shellCssHref}" data-kfarmai-global-shell="1">`);
  }
  if (!/static\/js\/v4-shell\.js/i.test(html)) {
    assets.push(`<script src="${shellJsSrc}" defer data-kfarmai-global-shell="1"></script>`);
  }
  html = html.replace(/<\/head>/i, firstPaintHead + assets.join('') + '</head>');
  if (!/data-v4-global-header/i.test(html)) {
    const relativePath = path.relative(outputDir, filePath).split(path.sep).join('/');
    const isHome = relativePath === 'index.html';
    html = addBodyClasses(html, ['v4-global-header-ready', ...(isHome ? ['v4-global-home'] : [])]);
    html = html.replace(/(<body\b[^>]*>)/i, `$1${globalHeaderHtml(isHome)}`);
  }
  fs.writeFileSync(filePath, html, 'utf8');
}
function applyGlobalShellTree(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) applyGlobalShellTree(target);
    else if (entry.isFile() && entry.name.endsWith('.html')) applyGlobalShellToHtml(target);
  }
}
applyGlobalShellTree(outputDir);

function countFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(
    (count, entry) => count + (entry.isDirectory() ? countFiles(path.join(directory, entry.name)) : 1),
    0,
  );
}

console.log(`Pages artifact built from explicit public allowlist: ${countFiles(outputDir)} files.`);
