-- Local/staging rollback only. Review backups before any production use.
begin;

drop trigger if exists posts_normalize_tags on public.posts;
do $$
begin
  if to_regclass('public.community_reports') is not null then
    execute 'drop trigger if exists community_reports_validate_target on public.community_reports';
  end if;
end;
$$;
drop function if exists public.toggle_post_bookmark(uuid);
drop function if exists public.toggle_post_reaction(uuid, text);
drop function if exists public.community_post_engagement(uuid);
drop function if exists public.validate_community_report_target();
drop function if exists public.normalize_post_tags_trigger();
drop function if exists public.normalize_community_tags(text[]);

drop table if exists public.community_reports;
drop table if exists public.post_bookmarks;
drop table if exists public.post_reactions;
drop table if exists public.user_blocks;
drop function if exists public.community_interaction_allowed(uuid, uuid);

drop index if exists public.posts_tags_gin_idx;
drop index if exists public.posts_category_created_at_idx;
alter table public.posts drop constraint if exists posts_tags_limit;
alter table public.posts drop column if exists tags;
alter table public.posts drop column if exists category_id;

drop table if exists public.community_channel_category_map;
drop table if exists public.community_categories;

notify pgrst, 'reload schema';
commit;
