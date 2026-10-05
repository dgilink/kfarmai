const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-pages-artifact-'));
let passed = 0;

function test(name, callback) {
  callback();
  passed += 1;
  console.log(`PASS ${name}`);
}

function run(script, args = []) {
  return spawnSync(process.execPath, [path.join(repoRoot, script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

try {
  const build = run('scripts/pages/build-pages-artifact.cjs', [`--output=${artifactDir}`]);
  test('allowlist artifact builder succeeds', () => assert.equal(build.status, 0, build.stderr));

  const verify = run('scripts/pages/verify-pages-artifact.cjs', [artifactDir]);
  test('artifact security verifier succeeds', () => assert.equal(verify.status, 0, verify.stderr));

  const mustExist = [
    'index.html', 'mfg.html', 'channel.html', 'agri-info.html',
    'kb/ras-recirculating-aquaculture.html',
    'kb/land-aquaculture-water-quality.html',
    'oauth/index.html', 'static/kfarmai-logo-horizontal.png',
    'data/agri-official-sources.json', 'sitemap.xml', 'robots.txt', 'CNAME',
  ];
  test('required public runtime files exist', () => {
    for (const file of mustExist) assert.ok(fs.existsSync(path.join(artifactDir, file)), file);
  });

  const mustNotExist = [
    'supabase/config.toml',
    'supabase/migrations/20261004133000_v3_production_rls_hardening.sql',
    'tests/phase5d2a-rls-hardening.test.cjs',
    'worker/wrangler.toml',
    '.github/workflows/pages.yml',
    'AGENTS.md',
    'KFarmAI_HISTORY_HANDOFF_20260919.md',
    'data/api_coverage_report.md',
    'static/kfarmai-main.zip',
    'kb/kfarmai_10h_seo_worker_README.txt',
  ];
  test('internal and development files are absent', () => {
    for (const file of mustNotExist) assert.ok(!fs.existsSync(path.join(artifactDir, file)), file);
  });

  test('guard rejects a forbidden SQL file', () => {
    fs.writeFileSync(path.join(artifactDir, 'leak.sql'), 'select 1;', 'utf8');
    const rejected = run('scripts/pages/verify-pages-artifact.cjs', [artifactDir]);
    assert.notEqual(rejected.status, 0);
    fs.rmSync(path.join(artifactDir, 'leak.sql'));
  });

  test('guard rejects a non-anon JWT', () => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const token = `${encode({ alg: 'HS256' })}.${encode({ role: 'service_role' })}.signaturevalue12345`;
    fs.writeFileSync(path.join(artifactDir, 'leak.js'), `const token = '${token}';`, 'utf8');
    const rejected = run('scripts/pages/verify-pages-artifact.cjs', [artifactDir]);
    assert.notEqual(rejected.status, 0);
  });

  console.log(`${passed}/${passed} Pages artifact security tests passed.`);
} finally {
  fs.rmSync(artifactDir, { recursive: true, force: true });
}
