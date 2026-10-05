begin;

drop function if exists public.community_feed_metrics(uuid[]);

-- Restore the Phase 4A transition mapping without deleting any legacy data.
update public.posts posts
set category_id = mapping.category_id
from public.community_channel_category_map mapping
where posts.category_id is null
  and posts.channel_id = mapping.channel_id
  and mapping.transition_status = 'archive';

notify pgrst, 'reload schema';

commit;
