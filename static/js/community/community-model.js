(function (global) {
  'use strict';

  const CATEGORIES = Object.freeze([
    { id: '41000000-0000-4000-8000-000000000001', slug: 'question-help', name: '질문·문제해결', icon: '💬', topic: 'problem' },
    { id: '41000000-0000-4000-8000-000000000002', slug: 'cultivation-knowhow', name: '재배·노하우', icon: '🌱', topic: 'knowhow' },
    { id: '41000000-0000-4000-8000-000000000003', slug: 'showcase-daily', name: '자랑·일상', icon: '📷', topic: 'daily' },
    { id: '41000000-0000-4000-8000-000000000004', slug: 'agri-field-info', name: '농업·현장정보', icon: '🌾', topic: 'field' }
  ]);

  const LEGACY_CATEGORY = Object.freeze({
    'plant-hospital': 'question-help',
    'plant-question': 'question-help',
    'crop-consult': 'question-help',
    'garden-class': 'cultivation-knowhow',
    'plant-brag': 'showcase-daily',
    'plant-meet': 'showcase-daily',
    'farmer-lounge': 'agri-field-info',
    'plant-share': 'agri-field-info'
  });

  function normalizeTags(values) {
    const result = [];
    for (const value of Array.isArray(values) ? values : []) {
      const tag = String(value || '').trim().replace(/^#+/, '').toLocaleLowerCase('ko-KR').slice(0, 30);
      if (tag && !result.includes(tag)) result.push(tag);
      if (result.length === 8) break;
    }
    return result;
  }

  function fallbackCategories() {
    return CATEGORIES.map(category => ({ ...category, sort_order: CATEGORIES.indexOf(category) + 1, is_active: true }));
  }

  async function loadCategories(client) {
    if (!client) return fallbackCategories();
    const { data, error } = await client
      .from('community_categories')
      .select('id,slug,name,description,sort_order,is_active')
      .eq('is_active', true)
      .order('sort_order');
    if (error || !Array.isArray(data) || data.length !== 4) return fallbackCategories();
    return data;
  }

  function categoryBySlug(categories, slug) {
    const canonical = LEGACY_CATEGORY[String(slug || '')] || String(slug || '');
    return (categories || CATEGORIES).find(category => category.slug === canonical) || null;
  }

  function categoryForPost(post, categories = CATEGORIES) {
    if (post?.community_categories?.slug) return post.community_categories;
    const direct = categories.find(category => category.id === post?.category_id);
    if (direct) return direct;
    return categoryBySlug(categories, post?.channels?.slug);
  }

  async function engagement(client, postId) {
    const { data, error } = await client.rpc('community_post_engagement', { target_post_id: postId });
    if (error) throw error;
    return data?.[0] || { same_symptom_count: 0, helpful_count: 0, same_symptom_active: false, helpful_active: false, saved: false };
  }

  async function toggleReaction(client, postId, type) {
    if (!['same_symptom', 'helpful'].includes(type)) throw new Error('invalid_reaction_type');
    const { data, error } = await client.rpc('toggle_post_reaction', { target_post_id: postId, target_reaction_type: type });
    if (error) throw error;
    return Boolean(data);
  }

  async function toggleBookmark(client, postId) {
    const { data, error } = await client.rpc('toggle_post_bookmark', { target_post_id: postId });
    if (error) throw error;
    return Boolean(data);
  }

  async function report(client, reporterUserId, targetType, targetId, reason) {
    const payload = { reporter_user_id: reporterUserId, target_type: targetType, target_id: targetId, reason: String(reason || '').trim() };
    const { data, error } = await client.from('community_reports').insert(payload).select('id,status,created_at').single();
    if (error) throw error;
    return data;
  }

  async function block(client, blockerUserId, blockedUserId) {
    const { error } = await client.from('user_blocks').insert({ blocker_user_id: blockerUserId, blocked_user_id: blockedUserId });
    if (error) throw error;
  }

  async function unblock(client, blockerUserId, blockedUserId) {
    const { error } = await client.from('user_blocks').delete().eq('blocker_user_id', blockerUserId).eq('blocked_user_id', blockedUserId);
    if (error) throw error;
  }

  async function blockedUserIds(client, blockerUserId) {
    if (!client || !blockerUserId) return new Set();
    const { data, error } = await client.from('user_blocks').select('blocked_user_id').eq('blocker_user_id', blockerUserId);
    if (error) throw error;
    return new Set((data || []).map(row => String(row.blocked_user_id)));
  }

  global.KFCommunity = Object.freeze({
    CATEGORIES,
    LEGACY_CATEGORY,
    normalizeTags,
    fallbackCategories,
    loadCategories,
    categoryBySlug,
    categoryForPost,
    engagement,
    toggleReaction,
    toggleBookmark,
    report,
    block,
    unblock,
    blockedUserIds
  });
})(window);
