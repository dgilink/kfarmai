const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputDir = path.resolve(repoRoot, outputArg ? outputArg.slice('--output='.length) : '_site');

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

function countFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(
    (count, entry) => count + (entry.isDirectory() ? countFiles(path.join(directory, entry.name)) : 1),
    0,
  );
}

console.log(`Pages artifact built from explicit public allowlist: ${countFiles(outputDir)} files.`);
