const fs = require('node:fs');
const path = require('node:path');

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
