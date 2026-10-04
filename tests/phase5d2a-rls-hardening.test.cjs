'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = read('supabase/config.toml');
const migration = read('supabase/migrations/20261004133000_v3_production_rls_hardening.sql');
const historical = [
  '20261002090000_secure_secret_comments.sql',
  '20261002091000_account_deletion_requests.sql',
  '20261002110000_v3_community_model.sql',
  '20261002130000_v3_community_feed_metrics.sql',
  '20261004100000_v3_community_moderation.sql'
].map(name => read(`supabase/migrations/${name}`));

let passed = 0;
function test(name, callback) {
  try { callback(); passed += 1; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

test('release migrations are enabled', () => {
  assert.match(config, /\[db\.migrations\][\s\S]*?enabled\s*=\s*true/);
});
test('production-compatible fixture schema paths are explicit', () => {
  assert.match(config, /schema_paths\s*=\s*\[[^\]]*phase2b-local-base\.sql[^\]]*phase4a-community-base\.sql/);
});
test('historical migration files remain present and unchanged in count', () => {
  assert.equal(historical.length, 5);
  for (const source of historical) assert.ok(source.length > 100);
});
test('hardening removes every legacy posts and comments write policy', () => {
  assert.match(migration, /tablename = 'posts' and cmd in \('INSERT', 'UPDATE', 'DELETE'\)/);
  assert.match(migration, /tablename = 'comments' and cmd in \('SELECT', 'INSERT', 'UPDATE', 'DELETE'\)/);
});
test('anon receives read-only table grants', () => {
  assert.match(migration, /revoke all privileges on table public\.posts, public\.comments from anon/);
  assert.match(migration, /grant select on table public\.posts, public\.comments to anon, authenticated/);
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete)[^;]*\bto anon\b/i);
});
test('account deletion queue grants only required service-role writes', () => {
  assert.match(migration, /grant select, insert, update on table public\.account_deletion_requests to service_role/);
  assert.doesNotMatch(migration, /grant[^;]+account_deletion_requests[^;]+to (?:public|anon|authenticated)/i);
});
test('authenticated posts insert requires a non-null JWT owner', () => {
  assert.match(migration, /posts_insert_authenticated_owner[\s\S]*auth\.uid\(\) is not null[\s\S]*user_id is not null[\s\S]*user_id = auth\.uid\(\)/);
});
test('posts update has USING and WITH CHECK ownership', () => {
  assert.match(migration, /posts_update_authenticated_owner[\s\S]*using[\s\S]*user_id = auth\.uid\(\)[\s\S]*with check[\s\S]*user_id = auth\.uid\(\)/i);
});
test('posts delete is owner-only', () => {
  assert.match(migration, /posts_delete_authenticated_owner[\s\S]*for delete[\s\S]*user_id = auth\.uid\(\)/i);
});
test('public and secret comment reads are separate policies', () => {
  assert.match(migration, /create policy comments_select_public\b/);
  assert.match(migration, /create policy comments_select_secret_participant\b/);
});
test('public comment policy excludes deleted and secret rows', () => {
  assert.match(migration, /comments_select_public[\s\S]*deleted_at is null[\s\S]*is_secret, false\) = false/);
});
test('secret comment policy is authenticated-only', () => {
  assert.match(migration, /comments_select_secret_participant[\s\S]*to authenticated/);
});
test('secret comment author remains allowed', () => {
  assert.match(migration, /comments_select_secret_participant[\s\S]*auth\.uid\(\) = user_id/);
});
test('secret comment post owner remains allowed', () => {
  assert.match(migration, /comments_select_secret_participant[\s\S]*posts\.user_id = auth\.uid\(\)/);
});
test('moderator visibility uses the server-verified role function', () => {
  assert.match(migration, /comments_select_secret_participant[\s\S]*public\.community_is_moderator\(\)/);
});
test('normal comment insert binds owner and rejects AI spoofing', () => {
  assert.match(migration, /comments_insert_authenticated_owner[\s\S]*user_id = auth\.uid\(\)[\s\S]*coalesce\(is_ai, false\) = false/);
});
test('comment update preserves owner and non-AI contract', () => {
  assert.match(migration, /comments_update_authenticated_owner[\s\S]*using[\s\S]*is_ai, false\) = false[\s\S]*with check[\s\S]*is_ai, false\) = false/i);
});
test('comment delete preserves owner and non-AI contract', () => {
  assert.match(migration, /comments_delete_authenticated_owner[\s\S]*user_id = auth\.uid\(\)[\s\S]*is_ai, false\) = false/);
});
test('interaction function binds actor to auth uid', () => {
  assert.match(migration, /community_interaction_allowed[\s\S]*actor_id = auth\.uid\(\)/);
});
test('interaction function remains SECURITY DEFINER with fixed search path', () => {
  assert.match(migration, /community_interaction_allowed[\s\S]*security definer[\s\S]*set search_path = public, pg_temp/i);
});
test('interaction function is revoked from public and anon', () => {
  assert.match(migration, /revoke all on function public\.community_interaction_allowed\(uuid, uuid\) from public, anon, authenticated/);
});
test('interaction function is granted only to authenticated browser callers', () => {
  assert.match(migration, /grant execute on function public\.community_interaction_allowed\(uuid, uuid\) to authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.community_interaction_allowed\([^;]+\) to (?:public|anon)/i);
});
test('hardening is additive and does not delete schema or rows', () => {
  assert.doesNotMatch(migration, /drop\s+(?:table|column)|truncate\s+|delete\s+from/i);
});

process.stdout.write(`Phase 5D-2A RLS hardening contracts: ${passed}/${passed} PASS\n`);
