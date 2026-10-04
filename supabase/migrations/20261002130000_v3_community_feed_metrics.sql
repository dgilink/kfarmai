begin;

-- Archive-only legacy posts remain readable through their direct URL, but are
-- intentionally excluded from canonical category feeds and public search.
update public.posts posts
set category_id = null
from public.community_channel_category_map mapping
where posts.channel_id = mapping.channel_id
  and mapping.transition_status = 'archive';

create or replace function public.community_feed_metrics(target_post_ids uuid[])
returns table (
  post_id uuid,
  comment_count bigint,
  same_symptom_count bigint,
  helpful_count bigint,
  same_symptom_active boolean,
  helpful_active boolean,
  saved boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with requested as (
    select distinct value as post_id
    from unnest(coalesce(target_post_ids, '{}'::uuid[])) as input(value)
    limit 100
  )
  select
    posts.id,
    (
      select count(*)
      from public.comments comments
      where comments.post_id = posts.id
        and comments.deleted_at is null
        and coalesce(comments.is_secret, false) = false
        and btrim(coalesce(comments.content, '')) <> '[kfarmai_deleted_comment]'
    ) as comment_count,
    (
      select count(*)
      from public.post_reactions reactions
      where reactions.post_id = posts.id
        and reactions.reaction_type = 'same_symptom'
    ) as same_symptom_count,
    (
      select count(*)
      from public.post_reactions reactions
      where reactions.post_id = posts.id
        and reactions.reaction_type = 'helpful'
    ) as helpful_count,
    exists (
      select 1 from public.post_reactions reactions
      where reactions.post_id = posts.id
        and reactions.user_id = auth.uid()
        and reactions.reaction_type = 'same_symptom'
    ) as same_symptom_active,
    exists (
      select 1 from public.post_reactions reactions
      where reactions.post_id = posts.id
        and reactions.user_id = auth.uid()
        and reactions.reaction_type = 'helpful'
    ) as helpful_active,
    exists (
      select 1 from public.post_bookmarks bookmarks
      where bookmarks.post_id = posts.id
        and bookmarks.user_id = auth.uid()
    ) as saved
  from requested
  join public.posts posts on posts.id = requested.post_id;
$$;

revoke all on function public.community_feed_metrics(uuid[]) from public;
grant execute on function public.community_feed_metrics(uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
