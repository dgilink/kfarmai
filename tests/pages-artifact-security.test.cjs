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

  test('home KB cards are rendered from the approved registry projection', () => {
    const home = fs.readFileSync(path.join(artifactDir, 'index.html'), 'utf8');
    const discovery = fs.readFileSync(path.join(artifactDir, 'static/js/kb-discovery.js'), 'utf8');
    const items = JSON.parse(fs.readFileSync(path.join(artifactDir, 'data/kb-index.json'), 'utf8')).items;
    assert.ok(home.includes('id="homeKbCards" aria-live="polite" data-kb-static="1"'));
    for (const item of items.slice(0, 4)) {
      assert.ok(home.includes(`href="${item.path}"`), item.path);
    }
    assert.ok(discovery.includes("homeGrid?.dataset.kbStatic === '1'"));
  });

  test('KB listing first paint uses uniform approved card structure', () => {
    const html = fs.readFileSync(path.join(artifactDir, 'kb/index.html'), 'utf8');
    const items = JSON.parse(fs.readFileSync(path.join(artifactDir, 'data/kb-index.json'), 'utf8')).items;
    const start = html.indexOf('<div id="kbGrid" class="kb-grid" aria-live="polite" data-kb-static="1">');
    const end = html.indexOf('</div>', start);
    assert.ok(start > 0 && end > start, 'approved KB listing present');
    const list = html.slice(start, end);
    const cards = [...list.matchAll(/<a class="kb-card(?: is-text-only)?" data-topic="[^"]+" href="(\/kb\/[a-z0-9-]+\.html)">([\s\S]*?)<\/a>/g)];
    assert.equal(cards.length, items.length, 'all approved registry articles render at first paint');
    for (const [index, [, href, contents]] of cards.entries()) {
      assert.equal(href, items[index].path, 'registry order and link preserved');
      assert.match(contents, /^((?:<img class="kb-list-thumb"[^>]+>)?)<span class="kb-list-copy"><small>[^<]+<\/small><strong>[^<]+<\/strong><\/span><span class="kb-list-arrow" aria-hidden="true">›<\/span>$/);
      assert.ok(contents.includes(items[index].date), 'published date shown in every row');
      assert.ok(contents.startsWith('<img class="kb-list-thumb"'), 'representative thumbnail shown in every row');
    }
    assert.ok(cards[0][0].includes('class="kb-card"'), 'newest article keeps the uniform thumbnail row');
  });

  test('requested article visuals are replaced only in the generated public artifact', () => {
    const irrigation = fs.readFileSync(path.join(artifactDir, 'kb/greenhouse-irrigation-precheck.html'), 'utf8');
    const strawberry = fs.readFileSync(path.join(artifactDir, 'kb/strawberry-winter-light-humidity-check.html'), 'utf8');
    assert.ok(irrigation.includes('greenhouse-irrigation-precheck-infographic-restyle-20261029-v2.svg'));
    assert.ok(strawberry.includes('/static/kb/strawberry-winter-light-humidity-check-hero-20261029.webp'));
    assert.ok(!strawberry.includes('Keepsake_Strawberry_by_USDA'));
    assert.ok(!strawberry.includes('온실 사진: USDA/ARS'));
  });

  test('knowledge list thumbnails use photos instead of article infographics', () => {
    const html = fs.readFileSync(path.join(artifactDir, 'kb/index.html'), 'utf8');
    const home = fs.readFileSync(path.join(artifactDir, 'index.html'), 'utf8');
    for (const file of [
      'pear-harvest-sorting-cold-storage-five-checks-photo-20261029.webp',
      'autumn-rain-wheat-barley-sowing-checklist-photo-20261029.webp',
    ]) {
      assert.ok(html.includes(`/static/kb/${file}`), file);
      assert.ok(home.includes(`/static/kb/${file}`), file);
    }
    const listRegion = html.split('id="kbGrid"')[1]?.split('</div>')[0] || '';
    assert.ok(!listRegion.includes('-infographic.'), 'list thumbnails must not use infographics');
    const irrigationPhoto = '/static/kb/greenhouse-irrigation-precheck-photo-20261029.jpg';
    assert.ok(listRegion.includes(irrigationPhoto), 'irrigation list uses the greenhouse irrigation photo');
  });

  test('all public HTML receives one versioned global shell and grouped cultivation topic', () => {
    const htmlFiles = [];
    const walk = directory => fs.readdirSync(directory, {withFileTypes:true}).forEach(entry => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(target);
    });
    walk(artifactDir);
    assert.ok(htmlFiles.length > 100, 'public screen inventory');
    const expectedShellVersion = require('node:crypto').createHash('sha256')
      .update(fs.readFileSync(path.join(repoRoot, 'static/css/v4-shell.css')))
      .update(fs.readFileSync(path.join(repoRoot, 'static/js/v4-shell.js')))
      .update(fs.readFileSync(path.join(repoRoot, 'static/js/agri-info/agri-feed-ui.js')))
      .update(fs.readFileSync(path.join(repoRoot, 'static/js/kb-discovery.js')))
      .digest('hex').slice(0, 16);
    for (const file of htmlFiles) {
      const html = fs.readFileSync(file, 'utf8');
      if (!/<\/head>/i.test(html)) continue;
      assert.equal((html.match(new RegExp(`static/css/v4-shell\\.css\\?v=${expectedShellVersion}`, 'g')) || []).length, 1, file);
      assert.equal((html.match(new RegExp(`static/js/v4-shell\\.js\\?v=${expectedShellVersion}`, 'g')) || []).length, 1, file);
      assert.equal((html.match(/data-v4-global-header/g) || []).length, 1, file);
      assert.equal((html.match(/data-v4-first-paint/g) || []).length, 1, file);
      assert.equal((html.match(/name="theme-color" content="#ffffff"/g) || []).length, 1, file);
      assert.match(html,/<body\b[^>]*\bv4-global-header-ready\b/i,file);
    }
    const agriInfo = fs.readFileSync(path.join(artifactDir, 'agri-info.html'), 'utf8');
    assert.ok(agriInfo.includes(`/static/js/agri-info/agri-feed-ui.js?v=${expectedShellVersion}`),
      'agricultural feed UI uses the content-derived cache key');
    const kbIndex = fs.readFileSync(path.join(artifactDir, 'kb/index.html'), 'utf8');
    assert.ok(kbIndex.includes(`/static/js/kb-discovery.js?v=${expectedShellVersion}`),
      'KB discovery UI uses the content-derived cache key');
    const kb = fs.readFileSync(path.join(artifactDir, 'kb/index.html'), 'utf8');
    assert.equal((kb.match(/data-category="재배노하우"/g) || []).length, 1);
    assert.ok(!kb.includes('data-category="식량작물·재배노하우"'));
    assert.ok(!kb.includes('data-category="식물병·재배노하우"'));
  });

  test('source KB index fallback is also readable before artifact build', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'kb/index.html'), 'utf8');
    const region = source.split('<div id="kbGrid" class="kb-grid" aria-live="polite">')[1]?.split('</div>')[0] || '';
    const cards = [...region.matchAll(/<a class="kb-card(?: is-text-only)?"[^>]*>([\s\S]*?)<\/a>/g)];
    assert.ok(cards.length >= 4);
    assert.ok(cards.every(([, body]) => body.includes('class="kb-list-copy"')
      && body.includes('class="kb-list-arrow"')), 'no raw <small>/<strong> directly in CSS grid columns');
    assert.ok(!region.includes('저장 관리 핵심 5가지 보기'), 'remove legacy fallback CTA');
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
