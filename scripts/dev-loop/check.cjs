'use strict';
// Read-only KFarmAI Dev Loop v1 verification: no commits, pushes or deployments.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const cli = process.argv.slice(2);
const full = cli.includes('--full');
const reportArg = cli.find(x => x.startsWith('--report='));
const reportPath = (reportArg && reportArg.slice('--report='.length)) ||
  process.env.DEV_LOOP_REPORT || path.join(os.tmpdir(), 'kfarmai-dev-loop-v1-report.json');
const python = process.platform === 'win32' ? 'python' : 'python3';
const steps = [];
const report = {
  schema: 'kfarmai-dev-loop-v1',
  timestamp: new Date().toISOString(),
  repository: 'dgilink/kfarmai',
  repositoryId: process.env.GITHUB_REPOSITORY_ID || 'NOT_VERIFIED_LOCALLY',
  mode: full ? 'full-local' : 'core',
  steps,
  notes: [],
  releaseReady: false
};
let artifact;
function run(name, command, args, timeoutMs = 90000) {
  const start = Date.now();
  const res = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024, windowsHide: true
  });
  const ok = !res.error && res.status === 0;
  steps.push({
    name, status: ok ? 'PASS' : 'FAIL', exitCode: res.status,
    durationMs: Date.now() - start,
    reason: res.error ? (res.error.code || res.error.name) : ok ? '' : 'EXIT_' + res.status
  });
  return {ok, stdout: res.stdout || ''};
}
function main() {
  if (Number(process.versions.node.split('.')[0]) < 20)
    throw new Error('NODE_VERSION_BELOW_20');
  const remote = run('Official Git remote', 'git', ['remote','get-url','origin'], 10000);
  if (!remote.ok) return;
  const origin = remote.stdout.trim();
  if (!/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)dgilink\/kfarmai(?:\.git)?$/.test(origin)) {
    steps[steps.length - 1].status = 'FAIL';
    steps[steps.length - 1].reason = 'WRONG_REPOSITORY';
    return;
  }
  const head = run('Git HEAD', 'git', ['rev-parse','HEAD'], 10000);
  if (head.ok) report.head = head.stdout.trim();
  const staged = run('Staged-file inventory', 'git', ['diff','--cached','--name-only'], 10000);
  if (staged.ok) report.stagedCount = staged.stdout.split(/\r?\n/).filter(Boolean).length;
  run('Git whitespace validation', 'git', ['diff','--check'], 10000);
  const testRoot = path.join(root, 'tests');
  const tests = fs.readdirSync(testRoot).filter(x => x.endsWith('.test.cjs')).sort();
  for (const file of tests) run('CJS ' + file, process.execPath, [path.join(testRoot, file)], 90000);
  run('KB post-publish audit', python,
    ['-m','unittest','discover','-s','tests','-p','test_kfarmai_post_publish_audit.py'], 120000);
  artifact = fs.mkdtempSync(path.join(os.tmpdir(), 'kfarmai-pages-artifact-devloop-'));
  const built = run('Pages build', process.execPath,
    ['scripts/pages/build-pages-artifact.cjs', '--output=' + artifact], 120000);
  if (built.ok) run('Pages allowlist/secret verifier', process.execPath,
    ['scripts/pages/verify-pages-artifact.cjs', artifact], 90000);
  else steps.push({name:'Pages allowlist/secret verifier',status:'FAIL',reason:'BUILD_FAILED'});
  if (full) {
    run('Complete Python unit suite', python,
      ['-m','unittest','discover','-s','tests','-p','test_*.py'], 240000);
    if (process.platform === 'win32')
      run('Windows Chrome touch smoke', process.execPath,
        ['tests/v4-mobile-nav-scroll.test.mjs'], 180000);
    else report.notes.push('Windows Chrome touch smoke NOT_RUN on this OS.');
    report.notes.push('Isolated Auth/Storage/Gateway writing E2E NOT_RUN. Requires separate authorized test.');
  } else {
    report.notes.push('Full Python, browser, and Auth/Gateway E2E NOT_RUN in core mode.');
  }
}
try { main(); }
catch (err) {
  steps.push({name:'Verifier internal error', status:'FAIL', reason:err.code || err.message || 'ERROR'});
} finally {
  if (artifact) fs.rmSync(artifact, {recursive:true, force:true});
  const ok = steps.every(x => x.status === 'PASS');
  report.corePass = ok;
  report.releaseReady = false;
  fs.mkdirSync(path.dirname(reportPath), {recursive:true});
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  for (const x of steps) process.stdout.write(x.status + ' ' + x.name + '\n');
  process.stdout.write((ok ? 'CORE_PASS' : 'CORE_FAIL') + ' | RELEASE_HOLD | ' + reportPath + '\n');
  process.exitCode = ok ? 0 : 1;
}