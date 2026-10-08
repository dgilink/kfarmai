'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const channel = read('channel.html');
const post = read('post.html');
const diagnosis = read('diagnosis.html');
const model = read('static/js/community/community-model.js');
const css = read('static/css/community-v3.css');
const migration = read('supabase/migrations/20261002130000_v3_community_feed_metrics.sql');
const rollback = read('supabase/rollback/20261002130000_v3_community_feed_metrics_down.sql');
const contract = read('docs/v3-phase4b-community-ui.md');
const homeCore = index.match(/<!-- ============ PAGE 1:[\s\S]*?<!-- ============ PAGE 2:/)?.[0] || '';

let passed = 0;
function test(name, callback) {
  try { callback(); passed += 1; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

test('home has exactly eight Design-1 channel cards', () => {
  assert.equal((homeCore.match(/class="v3-category-card"/g) || []).length, 8);
  for (const label of ['식물질문','병해충','성장기록','식물자랑','삽목·분갈이','나눔·분양','지역모임','자유이야기']) assert.match(homeCore, new RegExp(label));
});
test('legacy channels are not primary home navigation', () => {
  for (const label of ['식물 병원','식물 질문방','작물 상담방','식집사 모임','나눔·직거래']) assert.doesNotMatch(homeCore, new RegExp(label));
});
test('community feed precedes the Design-1 agriculture section', () => assert.ok(homeCore.indexOf('community-feed-section') < homeCore.indexOf('id="design1Agriculture"')));
test('home feed offers latest unanswered and helpful', () => {
  for (const sort of ['latest','unanswered','helpful']) assert.match(homeCore, new RegExp(`data-feed-sort="${sort}"`));
});
test('home channel navigation carries canonical category or query context', () => {
  const channelGrid = homeCore.match(/<nav class="v3-category-grid design1-channel-grid"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.equal((channelGrid.match(/href="channel\.html\?category=/g) || []).length, 8);
  assert.ok((channelGrid.match(/&amp;q=/g) || []).length >= 6);
});
test('home has primary write call to action', () => assert.match(homeCore, /id="design1Quick"[\s\S]*?openModal\('question-help'\)[\s\S]{0,80}질문하기/));
test('home AI and agricultural info remain direct Design-1 entries', () => {
  assert.match(homeCore, /href="diagnosis\.html"[\s\S]{0,100}사진확인/);
  assert.match(homeCore, /id="design1Agriculture"/);
  assert.match(homeCore, /href="agri-info\.html">전체보기/);
});
test('home core local links resolve to repository files', () => {
  const links = [...homeCore.matchAll(/href="([^"#?]+)(?:[?#][^"]*)?"/g)].map(match => match[1]);
  for (const link of links.filter(value => value && !/^(?:https?:|mailto:|tel:)/.test(value))) {
    assert.equal(fs.existsSync(path.join(root, link)), true, `missing core link: ${link}`);
  }
});
test('home core has no contest or prototype copy and labels unfinished services', () => {
  assert.doesNotMatch(homeCore, /공모전|MVP|데모|시제품/i);
  assert.match(homeCore, /초록장터는 준비 중입니다/);
});
test('write form exposes content purpose not user type', () => {
  assert.match(index, /무엇을 올리시나요\?/);
  assert.doesNotMatch(index.match(/<!-- WRITE MODAL -->[\s\S]*?<!-- DIAGNOSIS/)?.[0] || '', /식집사|전문농업인/);
});
test('write form supports crop cultivation region tags and images', () => {
  for (const id of ['postCrop','cultivationSelect','regionSelect','tagInput','postImages']) assert.match(index, new RegExp(`id="${id}"`));
  assert.match(index, /TAG_LIMIT\s*=\s*8/);
});
test('question purpose emphasizes photo input', () => assert.match(index, /photoField\.classList\.toggle\('is-emphasized',isQuestion\)/));
test('post payload stores canonical category and actual tags', () => {
  assert.match(index, /category_id:categoryRecord\.id/);
  assert.match(index, /selectedPostTags,crop,category,cultivation,region/);
});
test('feed metrics are fetched in one batch RPC', () => {
  assert.match(model, /rpc\('community_feed_metrics'/);
  assert.match(model, /target_post_ids: ids/);
  assert.doesNotMatch(model, /for\s*\([^)]*post[^)]*\)[\s\S]{0,120}rpc\('community_post_engagement'/);
});
test('batch function limits request size', () => assert.match(migration, /limit 100/i));
test('feed comment count excludes secret and deleted marker comments', () => {
  assert.match(migration, /is_secret, false\) = false/);
  assert.match(migration, /kfarmai_deleted_comment/);
});
test('feed shows real same symptom and helpful counts only when loaded', () => {
  assert.match(index, /same_symptom_count!==null/);
  assert.match(index, /helpful_count!==null/);
  assert.doesNotMatch(homeCore, /같은 증상\s+\d|도움됐어요\s+\d/);
});
test('same symptom helpful and bookmark use database contracts', () => {
  for (const name of ['toggle_post_reaction','toggle_post_bookmark']) assert.match(model, new RegExp(name));
  for (const name of ['toggleCommunityReaction','toggleCommunityBookmark']) assert.match(post, new RegExp(name));
});
test('blocked authors are filtered in home and category list', () => {
  assert.match(index, /visiblePosts\(source,blockedUserIdsSet\)/);
  assert.match(channel, /visiblePosts\(source,blockedUserIdsSet\)/);
});
test('blocked comments are filtered on detail', () => assert.match(post, /comments\|\|\[\]\)\.filter\(comment=>!comment\.deleted_at&&!blockedUserIdsSet\.has/));
test('MY supports block list and unblock', () => {
  assert.match(index, /차단한 사용자 관리/);
  assert.match(index, /function unblockCommunityUser/);
  assert.match(model, /async function unblock/);
});
test('post and comment report entry points use DB report contract', () => {
  assert.match(post, /reportCommunityTarget\('post'/);
  assert.match(post, /reportCommunityTarget\('comment'/);
  assert.match(model, /from\('community_reports'\)\.insert/);
});
test('report duplicate and failure messages are distinct', () => {
  assert.match(post, /23505[\s\S]{0,100}이미 신고한 콘텐츠/);
  assert.match(post, /신고를 접수하지 못했습니다/);
});
test('AI diagnosis carries draft tags', () => {
  assert.match(diagnosis, /tags: safeResult\.tags/);
  assert.match(diagnosis, /이 내용으로 질문하기/);
});
test('channel consumes AI draft into canonical question category', () => {
  assert.match(channel, /categorySlug: 'question-help'/);
  assert.match(channel, /localStorage\.removeItem\('kfarmai_pending_question'\)/);
});
test('AI draft is never automatically inserted', () => {
  const draftFlow = channel.match(/function applyPendingQuestionQuery[\s\S]*?function makePendingQuestionPreset/)?.[0] || '';
  assert.doesNotMatch(draftFlow, /from\('posts'\)|\.insert\(/);
});
test('archive legacy is excluded from canonical feed', () => {
  assert.match(migration, /transition_status = 'archive'/);
  assert.match(migration, /set category_id = null/);
  assert.match(model, /ARCHIVED_LEGACY/);
});
test('archive direct view is read only', () => {
  assert.match(channel, /archivedChannel/);
  assert.match(channel, /fab'\)\?\.setAttribute\('hidden',''/);
  assert.match(contract, /기존 직접 URL에서는 읽기만 허용/);
});
test('search includes title content crop region and tags', () => {
  for (const field of ['title.ilike','content.ilike','crop_tag.ilike','region_tag.ilike','contains(\'tags\'']) assert.match(index, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
test('category page consumes the related-search query', () => {
  assert.match(channel, /keyword=\(params\.get\('q'\)\|\|''\)\.trim\(\)/);
  assert.match(channel, /searchInput'\)\.value=keyword/);
});
test('old Render search is documented outside core route', () => assert.match(contract, /과거 Render 검색 API는 V3 홈의 기본 검색 경로가 아니다/));
test('responsive stylesheet removes fixed phone width on desktop', () => {
  assert.match(css, /max-width:\s*1180px/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1\.75fr\)\s+minmax\(280px,\s*\.75fr\)/);
});
test('responsive contracts cover compact mobile tablet and desktop', () => {
  assert.match(css, /@media \(max-width:\s*359px\)/);
  assert.match(css, /@media \(max-width:\s*899px\)/);
  assert.match(css, /@media \(min-width:\s*900px\)/);
});
test('rollback never deletes legacy posts comments or images', () => {
  assert.doesNotMatch(rollback, /delete\s+from\s+public\.(posts|comments)|drop\s+table\s+(?:if exists\s+)?public\.(posts|comments)/i);
});
test('frontend has no service role credential contract', () => {
  for (const source of [index,channel,post,diagnosis,model]) assert.doesNotMatch(source, /service[_-]?role/i);
});

process.stdout.write(`Phase 4B community UI contracts: ${passed}/${passed} PASS\n`);
