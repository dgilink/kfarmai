'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let passed = 0;
function test(name, callback) {
  try { callback(); passed += 1; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

const migration = read('supabase/migrations/20261002110000_v3_community_model.sql');
const rollback = read('supabase/rollback/20261002110000_v3_community_model_down.sql');
const contract = read('docs/v3-phase4a-community-model.md');
const model = read('static/js/community/community-model.js');
const index = read('index.html');
const channel = read('channel.html');
const post = read('post.html');

test('four canonical categories are stable', () => {
  for (const slug of ['question-help', 'cultivation-knowhow', 'showcase-daily', 'agri-field-info']) assert.match(migration, new RegExp(slug));
});
test('all eight legacy channels are explicitly mapped', () => {
  for (const slug of ['plant-hospital','plant-question','crop-consult','plant-brag','farmer-lounge','plant-share','garden-class','plant-meet']) assert.match(migration, new RegExp(slug));
});
test('legacy channel and channel_id are never dropped', () => {
  assert.doesNotMatch(migration, /drop\s+(?:table\s+public\.channels|column\s+channel_id)/i);
});
test('plant share is an archive transition', () => {
  assert.match(contract, /plant-share[\s\S]*ARCHIVE/);
  assert.match(migration, /channels\.slug = 'plant-share' then 'archive'/);
});
test('posts use optional normalized indexed tags', () => {
  assert.match(migration, /add column if not exists tags text\[\]/);
  assert.match(migration, /posts_tags_gin_idx/);
  assert.match(migration, /normalize_community_tags/);
});
test('reactions only support same symptom and helpful', () => {
  assert.match(migration, /reaction_type in \('same_symptom', 'helpful'\)/);
  assert.match(migration, /primary key \(post_id, user_id, reaction_type\)/);
});
test('bookmark is private and unique', () => {
  assert.match(migration, /create table if not exists public\.post_bookmarks/);
  assert.match(migration, /post_bookmarks_owner_read/);
  assert.match(migration, /primary key \(post_id, user_id\)/);
});
test('engagement count hides user identities behind RPC', () => {
  assert.match(migration, /community_post_engagement/);
  assert.doesNotMatch(model, /from\('post_reactions'\)\.select/);
});
test('reports cover posts and comments with duplicate defense', () => {
  assert.match(migration, /target_type in \('post', 'comment'\)/);
  assert.match(migration, /unique \(reporter_user_id, target_type, target_id\)/);
});
test('report privacy is owner-only', () => {
  assert.match(migration, /community_reports_owner_read[\s\S]*auth\.uid\(\) = reporter_user_id/);
  assert.doesNotMatch(migration, /community_reports[\s\S]{0,150}select to anon/);
});
test('blocks reject self and duplicate rows', () => {
  assert.match(migration, /primary key \(blocker_user_id, blocked_user_id\)/);
  assert.match(migration, /blocker_user_id <> blocked_user_id/);
});
test('blocked relationships prevent new reactions', () => {
  assert.match(migration, /community_interaction_allowed/);
  assert.match(migration, /interaction_blocked/);
});
test('all new mutable tables enable RLS', () => {
  for (const table of ['post_reactions','post_bookmarks','community_reports','user_blocks']) assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
});
test('rollback preserves legacy posts comments and channels', () => {
  assert.doesNotMatch(rollback, /drop table if exists public\.(?:posts|comments|channels)/);
  assert.match(rollback, /drop column if exists category_id/);
});
test('home exposes only four purpose categories', () => {
  assert.match(index, /4개 분류/);
  assert.doesNotMatch(index, /8개 채널/);
  for (const label of ['질문·문제해결','재배·노하우','자랑·일상','농업·현장정보']) assert.match(index, new RegExp(label));
});
test('post creation writes category_id and tags', () => {
  assert.match(index, /allowedPayloadKeys=\['category_id'.*'tags'\]/);
  assert.match(channel, /allowedPayloadKeys=\['user_id','category_id'.*'tags'\]/);
});
test('frontend common model has DB-backed engagement calls', () => {
  for (const call of ['community_post_engagement','toggle_post_reaction','toggle_post_bookmark']) assert.match(model, new RegExp(call));
});
test('post detail includes reaction save report and block entry points', () => {
  for (const fn of ['toggleCommunityReaction','toggleCommunityBookmark','reportCommunityTarget','blockCommunityUser']) assert.match(post, new RegExp(fn));
});
test('static fallback cards do not expose fabricated reaction counts', () => {
  assert.match(index, /FEATURE_SAME_SYMPTOM_REACTION = false/);
  assert.doesNotMatch(index, /same_symptom_count:\s*\d|helpful_count:\s*\d/);
  assert.match(channel, /question-block--same" hidden/);
});
test('blocked authors are hidden by frontend contract', () => {
  assert.match(post, /blockedUserIdsSet\.has/);
  assert.match(post, /차단한 사용자의 게시글입니다/);
});
test('service role is absent from frontend community files', () => {
  for (const source of [model,index,channel,post]) assert.doesNotMatch(source, /service[_-]?role/i);
});
test('rollback and data policy are documented', () => {
  assert.match(contract, /게시글·댓글·사진 URL을 삭제하거나 변경하지 않는다/);
  assert.match(contract, /rollback SQL/);
});

process.stdout.write(`Phase 4A community contracts: ${passed}/${passed} PASS\n`);
