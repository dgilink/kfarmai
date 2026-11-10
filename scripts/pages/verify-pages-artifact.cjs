const { isLocalPhoto, isRasterFile, isApprovedExternalPhoto } = require('./kb-list-photo.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..', '..');
const artifactDir = path.resolve(repoRoot, process.argv[2] || '_site');
const errors = [];

const mustExist = [
  'index.html',
  'mfg.html',
  'seed.html',
  'santo.html',
  'fert.html',
  'cpa.html',
  'channel.html',
  'agri-info.html',
  'kb/index.html',
  'policy/index.html',
  'rss.xml',
  'indexnow-key.txt',
  'data/kb-index.json',
  'data/kb-series.json',
  'data/policy-support-notices.json',
  'kb/series/plant-disease.html',
  'kb/series/vector-borne-disease.html',
  'kb/series/smartfarm-energy.html',
  'kb/series/aquafarm-energy.html',
  'static/css/kb-series.css',
  'subsidy-calendar.html',
  'kb/ras-recirculating-aquaculture.html',
  'kb/land-aquaculture-water-quality.html',
  'oauth/index.html',
  'oauth/privacy/index.html',
  'static/kfarmai-logo-horizontal.png',
  'sitemap.xml',
  'robots.txt',
  'CNAME',
];

const forbiddenTopLevel = new Set([
  '.git', '.github', 'backup', 'backups', 'coverage', 'docs', 'logs', 'node_modules',
  'private', 'scripts', 'supabase', 'tests', 'worker',
]);

const secretPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['service role credential', /service[_-]?role[^\r\n]{0,50}(?:=|:)[^\r\n]{12,}/gi],
  ['authorization bearer credential', /authorization[^\r\n]{0,30}bearer\s+[A-Za-z0-9._-]{20,}/gi],
  ['provider credential', /(?:cloudflare|resend)[_-]?(?:api[_-]?)?(?:token|key)[^\r\n]{0,50}(?:=|:)[^\r\n]{12,}/gi],
];

function walk(directory, relative = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.posix.join(relative, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      errors.push(`symlink is not allowed: ${relativePath}`);
    } else if (entry.isDirectory()) {
      files.push(...walk(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function exists(relativePath) {
  return fs.existsSync(path.join(artifactDir, relativePath));
}

function isForbiddenFile(relativePath) {
  const basename = path.posix.basename(relativePath);
  const lower = basename.toLowerCase();
  return lower === '.env'
    || lower.startsWith('.env.')
    || lower.endsWith('.sql')
    || lower.endsWith('.toml')
    || lower.endsWith('.md')
    || lower.endsWith('.zip')
    || lower === 'package.json'
    || lower === 'package-lock.json'
    || /^agents.*\.md$/i.test(basename)
    || /history_handoff.*\.md$/i.test(basename);
}

function resolvePublicReference(htmlRelativePath, rawReference) {
  const value = rawReference.trim();
  if (!value || value.startsWith('#') || value.startsWith('?')) return null;
  if (/^(?:https?:|mailto:|tel:|javascript:|data:|blob:)/i.test(value)) return null;
  if (value.includes('${') || value.includes('{{') || value.includes('<%')) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(value.split('#')[0].split('?')[0]);
  } catch {
    errors.push(`invalid encoded reference in ${htmlRelativePath}`);
    return null;
  }
  if (!decoded || decoded.startsWith('/api/')) return null;

  const relative = decoded.startsWith('/')
    ? decoded.slice(1)
    : path.posix.normalize(path.posix.join(path.posix.dirname(htmlRelativePath), decoded));
  if (!relative || relative === '.') return 'index.html';
  return relative;
}

function referenceExists(relativePath) {
  if (exists(relativePath)) return true;
  if (relativePath.endsWith('/')) return exists(`${relativePath}index.html`);
  if (!path.posix.extname(relativePath)) {
    return exists(`${relativePath}.html`) || exists(path.posix.join(relativePath, 'index.html'));
  }
  return false;
}

function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

if (!fs.existsSync(artifactDir) || !fs.statSync(artifactDir).isDirectory()) {
  console.error('Pages artifact verification failed: artifact directory is missing.');
  process.exit(1);
}

for (const required of mustExist) {
  if (!exists(required)) errors.push(`required public file is missing: ${required}`);
}

const files = walk(artifactDir);
if (exists('data/kb-index.json')) {
  const kbIndex = JSON.parse(fs.readFileSync(path.join(artifactDir, 'data/kb-index.json'), 'utf8'));
  const baseKeys = ['category','date','path','title'];
  const seriesKeys = ['category','content_level','date','path','series_id','series_order','series_title','title'];
  const allowedShapes = new Set([
    baseKeys.join(','), [...baseKeys,'image'].sort().join(','),
    seriesKeys.join(','), [...seriesKeys,'image'].sort().join(','),
  ]);
  if (!Array.isArray(kbIndex.items) || kbIndex.items.some((item) => {
    const keys = Object.keys(item).sort().join(',');
    const seriesValid = !('series_id' in item) || (
      /^[a-z0-9-]+$/.test(item.series_id) &&
      typeof item.series_title === 'string' && item.series_title.length > 0 && item.series_title.length <= 80 &&
      Number.isInteger(item.series_order) && item.series_order > 0 &&
      typeof item.content_level === 'string' && item.content_level.length > 0 && item.content_level.length <= 32
    );
    return !allowedShapes.has(keys)
      || !seriesValid
      || ('image' in item && !(isApprovedExternalPhoto(item.path, item.image) || (isLocalPhoto(item.image) && isRasterFile(artifactDir, item.image))))
      || !/^\/kb\/[a-z0-9-]+\.html$/.test(item.path)
      || !exists(item.path.slice(1));
  })) {
    errors.push('KB index is not a safe published-content projection');
  }
}
if (exists('data/kb-series.json')) {
  try {
    const publication = JSON.parse(fs.readFileSync(path.join(artifactDir, 'data/kb-series.json'), 'utf8'));
    const seen = new Set();
    if (!Array.isArray(publication.series) || publication.series.some(series => {
      const expectedKeys = 'axis,description,id,items,path,related,subtitle,title';
      const invalidIdentity = Object.keys(series).sort().join(',') !== expectedKeys ||
        !/^[a-z0-9-]+$/.test(series.id || '') || seen.has(series.id) ||
        series.path !== `/kb/series/${series.id}.html` || !exists(series.path.slice(1)) ||
        typeof series.title !== 'string' || !series.title || series.title.length > 80 ||
        typeof series.description !== 'string' || !series.description || series.description.length > 600 ||
        !Array.isArray(series.items) || !Array.isArray(series.related);
      seen.add(series.id);
      if (invalidIdentity) return true;
      const allItems = [...series.items, ...series.related];
      return allItems.some(item =>
        !/^\/kb\/[a-z0-9-]+\.html$/.test(item.path || '') || !exists(item.path.slice(1)) ||
        typeof item.title !== 'string' || !item.title ||
        (series.items.includes(item) && (
          item.series_id !== series.id || !Number.isInteger(item.series_order) || item.series_order < 1 ||
          typeof item.content_level !== 'string' || !item.content_level
        )));
    })) errors.push('KB series data is not a safe published-content projection');
  } catch {
    errors.push('KB series data is not valid JSON');
  }
}
if (exists('data/policy-support-notices.json')) {
  try {
    const publication = JSON.parse(fs.readFileSync(path.join(artifactDir, 'data/policy-support-notices.json'), 'utf8'));
    const items = publication.items;
    const identifiers = new Set();
    const isOfficial = raw => {
      try {
        const url = new URL(raw);
        const isYecheonNotice = url.host === 'www.ycg.kr' &&
          url.pathname === '/open.content/ko/administrative/news/announcement/' &&
          /^[0-9]+$/.test(url.searchParams.get('id') || '');
        const isJeonbukAgriNotice = url.host === 'www.jvada.or.kr' &&
          url.pathname === '/bbs/board.php' && url.search === '?bo_id=notice&wr_id=1213';
        return url.protocol === 'https:' && !url.username && !url.password &&
          (/\.go\.kr$|\.gov\.kr$/.test(url.hostname) || ['bojo.go.kr', 'agrix.go.kr'].includes(url.hostname) || isYecheonNotice || isJeonbukAgriNotice);
      } catch { return false; }
    };
    if (publication.schemaVersion !== 1 || !Array.isArray(items) || items.some(item => {
      const key = `${item.sourceId}:${item.externalId}`;
      const hash = crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(
        Object.entries(item).filter(([field]) => field !== 'sourceHash')
      ))).digest('hex');
      const checkingDates = item.applicationDateStatus === 'checking';
      const datesValid = (item.applicationStart === null || /^\d{4}-\d{2}-\d{2}$/.test(item.applicationStart || '')) &&
        (checkingDates ? item.applicationEnd === null && typeof item.dateCheckReason === 'string' && item.dateCheckReason.trim() :
          /^\d{4}-\d{2}-\d{2}$/.test(item.applicationEnd || ''));
      const detailPath = `policy/${item.slug}.html`;
      const dateWarningVisible = !checkingDates || (/^[a-z0-9-]+$/.test(item.slug || '') && exists(detailPath) &&
        /<dl class="policy-facts"><dt>신청 기간<\/dt><dd>[^<]*<strong class="policy-date-unverified">날짜 확인 중<\/strong>/.test(
          fs.readFileSync(path.join(artifactDir, detailPath), 'utf8')));
      const invalid = item.reviewStatus !== 'approved' || !item.sourceId || !item.externalId || !item.title || !item.agency ||
        !/^\d{4}-\d{2}-\d{2}$/.test(item.verifiedAt || '') || item.sourceHash !== hash ||
        !datesValid || !dateWarningVisible || (item.verificationUrl && !isOfficial(item.verificationUrl)) ||
        !/^[a-z0-9-]+$/.test(item.slug || '') || !isOfficial(item.officialUrl) || identifiers.has(key) ||
        !exists(`policy/${item.slug}.html`) ||
        !fs.readFileSync(path.join(artifactDir, 'subsidy-calendar.html'), 'utf8').includes(`/policy/${item.slug}.html`);
      identifiers.add(key);
      return invalid;
    })) errors.push('policy support public data contains an unapproved, invalid or duplicate notice');
  } catch {
    errors.push('policy support public data is not valid JSON');
  }
}
for (const relativePath of files) {
  const forbiddenSegment = relativePath.split('/').find((segment) => forbiddenTopLevel.has(segment));
  if (forbiddenSegment) errors.push(`forbidden directory published: ${forbiddenSegment}/`);
  if (isForbiddenFile(relativePath)) errors.push(`forbidden file published: ${relativePath}`);

  const absolutePath = path.join(artifactDir, relativePath);
  const extension = path.extname(relativePath).toLowerCase();
  if (!['.html', '.css', '.js', '.json', '.xml', '.txt'].includes(extension)) continue;
  const content = fs.readFileSync(absolutePath, 'utf8');

  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) errors.push(`${label} detected in artifact: ${relativePath}`);
  }
  if (/(?:[A-Z]:\\Users\\|\/Users\/|\/home\/runner\/work\/)/i.test(content)) {
    errors.push(`local filesystem path detected in artifact: ${relativePath}`);
  }

  const jwtPattern = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
  for (const token of content.match(jwtPattern) || []) {
    const payload = decodeJwtPayload(token);
    if (!payload || payload.role !== 'anon') {
      errors.push(`non-anon JWT detected in artifact: ${relativePath}`);
    }
  }
}

const sitemap = fs.readFileSync(path.join(artifactDir, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>https:\/\/kfarmai\.com([^<]*)<\/loc>/g)].map((match) => match[1] || '/');
for (const publicPath of sitemapUrls) {
  const relativePath = publicPath === '/' ? 'index.html' : publicPath.replace(/^\//, '');
  if (!referenceExists(relativePath)) errors.push(`sitemap target is missing: ${publicPath}`);
}

const rss = fs.readFileSync(path.join(artifactDir, 'rss.xml'), 'utf8');
const rssGuids = [...rss.matchAll(/<guid isPermaLink="true">(https:\/\/kfarmai\.com\/kb\/[^<]+)<\/guid>/g)].map(m => m[1]);
if (!rss.includes('application/rss+xml') || !rss.includes('<rss version="2.0"') || !rssGuids.length ||
    new Set(rssGuids).size !== rssGuids.length || rssGuids.some(url => !sitemapUrls.includes(new URL(url).pathname))) {
  errors.push('RSS invalid, duplicated or references an unapproved sitemap URL');
}
const indexnowKey = fs.readFileSync(path.join(artifactDir,'indexnow-key.txt'),'utf8').trim();
if (!/^[a-f0-9]{32}$/.test(indexnowKey)) errors.push('IndexNow ownership proof invalid');
for (const publicPath of sitemapUrls.filter(p=>p.startsWith('/kb/')||p.startsWith('/policy/'))) {
  const file = path.join(artifactDir,publicPath.slice(1));
  if (!fs.existsSync(file)) continue;
  const head = fs.readFileSync(file,'utf8').split(/<\/head>/i)[0];
  if (/<meta\s+name=["']robots["'][^>]*content=["'][^"']*\bnoindex\b/i.test(head)) {
    errors.push('noindex public sitemap entry: '+publicPath);
  }
}
for (const relativePath of files.filter((file) => file.endsWith('.html'))) {
  const content = fs.readFileSync(path.join(artifactDir, relativePath), 'utf8');
  const references = [...content.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const reference of references) {
    const target = resolvePublicReference(relativePath, reference);
    if (target && !referenceExists(target)) {
      errors.push(`missing local reference from ${relativePath}: ${target}`);
    }
  }
}

for (const relativePath of files.filter((file) => file.endsWith('.css'))) {
  const content = fs.readFileSync(path.join(artifactDir, relativePath), 'utf8');
  const references = [...content.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((match) => match[1]);
  for (const reference of references) {
    const target = resolvePublicReference(relativePath, reference);
    if (target && !referenceExists(target)) {
      errors.push(`missing local CSS reference from ${relativePath}: ${target}`);
    }
  }
}

if (errors.length) {
  console.error(`Pages artifact verification failed with ${errors.length} issue(s):`);
  for (const error of [...new Set(errors)]) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Pages artifact security contract passed: ${files.length} files, ${sitemapUrls.length} sitemap URLs.`);
