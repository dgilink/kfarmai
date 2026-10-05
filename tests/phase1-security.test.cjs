'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const safeMarkdown = require('../static/js/security/safe-markdown.js');
const diagnosisClient = require('../static/js/ai/diagnosis-client.js');

function loadDeletionHandler(fetchImpl) {
  let handler;
  const environment = {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'public-anon-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key'
  };
  vm.runInNewContext(read('supabase/functions/request-account-deletion/index.ts'), {
    Deno: {
      serve(callback) { handler = callback; },
      env: { get(name) { return environment[name] || ''; } }
    },
    fetch: fetchImpl,
    Request,
    Response,
    Headers,
    URL,
    JSON,
    Date,
    Error,
    console: { error() {}, warn() {}, log() {} }
  });
  return handler;
}

let passed = 0;
function test(name, callback) {
  try {
    const result = callback();
    if (result && typeof result.then === 'function') {
      return result.then(() => { passed += 1; }).catch(error => {
        error.message = `${name}: ${error.message}`;
        throw error;
      });
    }
    passed += 1;
    return Promise.resolve();
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    return Promise.reject(error);
  }
}

function hasExecutableMarkup(html) {
  return /<(script|style|iframe|object|embed|svg|img)\b/i.test(html)
    || /href\s*=\s*["']\s*javascript:/i.test(html);
}

async function run() {
  const attacks = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '[x](javascript:alert(1))',
    '<svg onload=alert(1)>'
  ];

  for (const attack of attacks) {
    await test(`safe markdown blocks ${attack.slice(0, 18)}`, () => {
      const html = safeMarkdown.render(attack);
      assert.equal(hasExecutableMarkup(html), false);
    });
  }

  await test('safe markdown keeps approved formatting', () => {
    const html = safeMarkdown.render('**강조**\n- 항목\n[공식자료](https://example.com)');
    assert.match(html, /<strong>강조<\/strong>/);
    assert.match(html, /<ul><li>항목<\/li><\/ul>/);
    assert.match(html, /href="https:\/\/example\.com"/);
  });

  await test('unsafe link becomes plain text', () => {
    assert.equal(safeMarkdown.render('[실행](javascript:alert(1))'), '<p>실행)</p>');
  });

  await test('diagnosis request schema is stable', () => {
    assert.deepEqual(diagnosisClient.buildRequest({
      crop: '고추', symptom: '잎 말림', cultivationEnv: '노지', region: '순천', imageBase64: 'abc'
    }), {
      symptom: '작물명: 고추\n재배환경: 노지\n증상: 잎 말림',
      crop: '고추', cultivationEnv: '노지', region: '순천', image_base64: 'abc'
    });
  });

  await test('diagnosis client uses only the server function', async () => {
    let request;
    const result = await diagnosisClient.analyze({ symptom: '잎 반점' }, {
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => ({ mode: 'AI 참고 진단' }) };
      }
    });
    assert.match(request.url, /\/functions\/v1\/bright-action$/);
    assert.equal(JSON.parse(request.options.body).symptom, '증상: 잎 반점');
    assert.equal(result.mode, 'AI 참고 진단');
  });

  await test('diagnosis client rejects server failure', async () => {
    await assert.rejects(
      diagnosisClient.analyze({ symptom: '잎 반점' }, {
        fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) })
      }),
      /DIAGNOSIS_HTTP_503/
    );
  });

  const indexHtml = read('index.html');
  const diagnosisHtml = read('diagnosis.html');
  const browserAi = `${indexHtml}\n${diagnosisHtml}\n${read('static/js/ai/diagnosis-client.js')}`;

  await test('frontend has no direct AI provider call', () => {
    assert.doesNotMatch(browserAi, /api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.openai\.com/i);
    assert.doesNotMatch(browserAi, /x-api-key|anthropic-version|YOUR_API_KEY/i);
  });

  await test('both diagnosis screens use shared client', () => {
    assert.match(indexHtml, /KFAIDiagnosisClient\.analyze/);
    assert.match(diagnosisHtml, /KFAIDiagnosisClient\.analyze/);
  });

  await test('both diagnosis screens avoid marked', () => {
    assert.doesNotMatch(indexHtml, /marked(?:\.min)?\.js|marked\.parse/);
    assert.doesNotMatch(diagnosisHtml, /marked(?:\.min)?\.js|marked\.parse/);
  });

  await test('changed HTML inline scripts compile', () => {
    for (const [name, html] of [['index.html', indexHtml], ['diagnosis.html', diagnosisHtml]]) {
      const scriptPattern = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
      for (const match of html.matchAll(scriptPattern)) {
        if (/application\/ld\+json/i.test(match[1])) continue;
        assert.doesNotThrow(() => new Function(match[2]), `${name} inline script syntax`);
      }
    }
  });

  await test('new local script references exist', () => {
    for (const html of [indexHtml, diagnosisHtml]) {
      for (const match of html.matchAll(/<script[^>]+src="(static\/js\/[^"]+)"/gi)) {
        const relativePath = match[1].split('?')[0].split('#')[0];
        assert.equal(fs.existsSync(path.join(root, relativePath)), true, match[1]);
      }
    }
  });

  await test('core feature entry points remain present', () => {
    const checks = [
      [indexHtml, /function openLogin\(/],
      [indexHtml, /function submitPost\(/],
      [indexHtml, /function uploadPostImages\(/],
      [indexHtml, /function runDiagnosis\(/],
      [read('post.html'), /function loadComments\(/],
      [read('post.html'), /storage\.from\('post-images'\)/],
      [read('channel.html'), /from\('posts'\)\.insert/],
      [read('market-prices.html'), /\/api\/kamis\/price-summary/],
      [read('agri-weather.html'), /\/api\/weather\/forecast/],
      [read('public-data.html'), /\/api\/ncpms\/diseases/]
    ];
    for (const [source, pattern] of checks) assert.match(source, pattern);
  });

  await test('major static links resolve locally', () => {
    const pages = ['index.html', 'diagnosis.html', 'channel.html', 'post.html', 'market-prices.html', 'agri-weather.html', 'public-data.html'];
    for (const page of pages) {
      const html = read(page);
      for (const match of html.matchAll(/(?:href|src)="([^"{}$]+)"/gi)) {
        const raw = match[1];
        if (/^(?:https?:|data:|mailto:|tel:|#|javascript:)/i.test(raw)) continue;
        const clean = raw.split('?')[0].split('#')[0];
        if (!clean || clean.includes('${')) continue;
        const fromRoot = clean.startsWith('/') ? clean.slice(1) : path.join(path.dirname(page), clean);
        const candidate = path.join(root, fromRoot);
        const resolved = fs.existsSync(candidate) || fs.existsSync(path.join(candidate, 'index.html'));
        assert.equal(resolved, true, `${page} -> ${raw}`);
      }
    }
  });

  await test('AI failures do not create normal diagnosis fallback', () => {
    assert.doesNotMatch(browserAi, /buildHomeFallbackDiagnosisData|buildFallbackDiagnosisResult|공공정보 확인용 기본 결과를 만들었습니다/);
    assert.match(indexHtml, /현재 AI 분석을 불러오지 못했습니다/);
    assert.match(diagnosisHtml, /현재 AI 분석을 불러오지 못했습니다/);
  });

  await test('account deletion no longer stores a local request', () => {
    assert.doesNotMatch(indexHtml, /kfarmai_account_delete_requested/);
    assert.match(indexHtml, /confirmation:'DELETE_MY_ACCOUNT'/);
  });

  await test('account deletion signs out only after server success check', () => {
    const successCheck = indexHtml.indexOf("result.status!=='pending'");
    const signOut = indexHtml.indexOf('await _sb.auth.signOut()', successCheck);
    assert.ok(successCheck >= 0 && signOut > successCheck);
  });

  const deletionFunction = read('supabase/functions/request-account-deletion/index.ts');
  await test('account deletion endpoint blocks unauthenticated requests', async () => {
    const handler = loadDeletionHandler(async () => { throw new Error('fetch must not run'); });
    const response = await handler(new Request('https://project.supabase.co/functions/v1/request-account-deletion', {
      method: 'POST',
      headers: { origin: 'https://kfarmai.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' })
    }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).ok, false);
  });

  await test('account deletion derives request identity from verified session', async () => {
    const calls = [];
    const handler = loadDeletionHandler(async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'verified-user-id' }), { status: 200 });
      }
      return new Response(JSON.stringify([{ id: 'request-id', status: 'pending', requested_at: '2026-10-02T00:00:00Z' }]), { status: 200 });
    });
    const response = await handler(new Request('https://project.supabase.co/functions/v1/request-account-deletion', {
      method: 'POST',
      headers: { origin: 'https://kfarmai.com', authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT', user_id: 'forged-user-id', email: 'forged@example.com' })
    }));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.status, 'pending');
    assert.equal(JSON.parse(calls[1].options.body).user_id, 'verified-user-id');
  });

  await test('duplicate account deletion requests stay on one user contract', async () => {
    let queueWrites = 0;
    const handler = loadDeletionHandler(async url => {
      if (String(url).endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'same-verified-user' }), { status: 200 });
      }
      queueWrites += 1;
      return new Response(JSON.stringify([{ id: 'same-request-id', status: 'pending' }]), { status: 200 });
    });
    const makeRequest = () => new Request('https://project.supabase.co/functions/v1/request-account-deletion', {
      method: 'POST',
      headers: { origin: 'https://kfarmai.com', authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' })
    });
    const first = await (await handler(makeRequest())).json();
    const second = await (await handler(makeRequest())).json();
    assert.equal(first.requestId, 'same-request-id');
    assert.equal(second.requestId, 'same-request-id');
    assert.equal(queueWrites, 2);
  });

  await test('account deletion does not report success when persistence fails', async () => {
    const handler = loadDeletionHandler(async url => {
      if (String(url).endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'verified-user-id' }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: 'db unavailable' }), { status: 503 });
    });
    const response = await handler(new Request('https://project.supabase.co/functions/v1/request-account-deletion', {
      method: 'POST',
      headers: { origin: 'https://kfarmai.com', authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' })
    }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).ok, false);
  });

  await test('account deletion derives identity from JWT', () => {
    assert.match(deletionFunction, /\/auth\/v1\/user/);
    assert.match(deletionFunction, /user_id: user\.id/);
    assert.doesNotMatch(deletionFunction, /payload\.(user_id|email)/);
  });

  await test('service role is server-only', () => {
    assert.doesNotMatch(browserAi, /SUPABASE_SERVICE_ROLE_KEY|service[_-]?role/i);
    assert.match(deletionFunction, /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
  });

  const secretMigration = read('supabase/migrations/20261002090000_secure_secret_comments.sql');
  await test('secret comment policy keeps public comments visible', () => {
    assert.match(secretMigration, /coalesce\(is_secret, false\) = false/);
  });

  await test('secret comment policy permits author and post owner', () => {
    assert.match(secretMigration, /auth\.uid\(\) = user_id/);
    assert.match(secretMigration, /posts\.user_id = auth\.uid\(\)/);
  });

  await test('secret comment policy removes permissive select policies', () => {
    assert.match(secretMigration, /pg_policies/);
    assert.match(secretMigration, /cmd = 'SELECT'/);
  });

  const deletionMigration = read('supabase/migrations/20261002091000_account_deletion_requests.sql');
  await test('deletion request table denies browser roles', () => {
    assert.match(deletionMigration, /enable row level security/);
    assert.match(deletionMigration, /revoke all .* from anon, authenticated/);
  });

  await test('Phase 2A rollout and privacy contracts cover required gates', () => {
    const rollout = read('docs/v3-phase1-production-rollout.md');
    const privacy = read('docs/phase1-account-deletion-data-contract.md');
    const sourceOfTruth = read('docs/v3-source-of-truth-draft.md');
    for (const heading of ['Pre-check', 'Deploy Order', 'Rollback', 'Post-check']) assert.match(rollout, new RegExp(heading));
    for (const item of ['처리 예상 기한', 'Supabase Auth 계정', '공개 게시글', '공개 댓글', '업로드 사진', '요청 취소', '완료 통지']) {
      assert.match(privacy, new RegExp(item));
    }
    assert.match(sourceOfTruth, /feature\/\* 또는 refactor\/\*/);
    assert.match(sourceOfTruth, /→ main/);
    assert.match(sourceOfTruth, /→ Production/);
  });

  process.stdout.write(`Phase 1 security contracts: ${passed}/${passed} PASS\n`);
}

run().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
