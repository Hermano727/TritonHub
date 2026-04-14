-- 0009_community_v3.sql
-- Adds: general_tags to community_posts
--       parent_reply_id + is_anonymous to community_replies
--       community_post_downvotes table
--       community_reply_upvotes + community_reply_downvotes tables
--       refreshed views for both posts and replies
-- Run in Supabase SQL Editor or via supabase db push.

-- ---------------------------------------------------------------------------
-- Extend community_posts
-- ---------------------------------------------------------------------------

alter table public.community_posts
  add column if not exists general_tags text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Extend community_replies
-- ---------------------------------------------------------------------------

alter table public.community_replies
  add column if not exists parent_reply_id uuid references public.community_replies (id) on delete set null,
  add column if not exists is_anonymous boolean not null default false;

-- ---------------------------------------------------------------------------
-- Post downvotes table
-- ---------------------------------------------------------------------------

create table if not exists public.community_post_downvotes (
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists community_post_downvotes_post_idx
  on public.community_post_downvotes (post_id);

-- ---------------------------------------------------------------------------
-- Reply upvotes table
-- ---------------------------------------------------------------------------

create table if not exists public.community_reply_upvotes (
  reply_id   uuid not null references public.community_replies (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reply_id, user_id)
);

create index if not exists community_reply_upvotes_reply_idx
  on public.community_reply_upvotes (reply_id);

-- ---------------------------------------------------------------------------
-- Reply downvotes table
-- ---------------------------------------------------------------------------

create table if not exists public.community_reply_downvotes (
  reply_id   uuid not null references public.community_replies (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reply_id, user_id)
);

create index if not exists community_reply_downvotes_reply_idx
  on public.community_reply_downvotes (reply_id);

-- ---------------------------------------------------------------------------
-- RLS — community_post_downvotes
-- ---------------------------------------------------------------------------

alter table public.community_post_downvotes enable row level security;

drop policy if exists "post_downvotes_select_all" on public.community_post_downvotes;
create policy "post_downvotes_select_all"
  on public.community_post_downvotes for select
  to authenticated
  using (true);

drop policy if exists "post_downvotes_insert_own" on public.community_post_downvotes;
create policy "post_downvotes_insert_own"
  on public.community_post_downvotes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "post_downvotes_delete_own" on public.community_post_downvotes;
create policy "post_downvotes_delete_own"
  on public.community_post_downvotes for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS — community_reply_upvotes
-- ---------------------------------------------------------------------------

alter table public.community_reply_upvotes enable row level security;

drop policy if exists "reply_upvotes_select_all" on public.community_reply_upvotes;
create policy "reply_upvotes_select_all"
  on public.community_reply_upvotes for select
  to authenticated
  using (true);

drop policy if exists "reply_upvotes_insert_own" on public.community_reply_upvotes;
create policy "reply_upvotes_insert_own"
  on public.community_reply_upvotes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "reply_upvotes_delete_own" on public.community_reply_upvotes;
create policy "reply_upvotes_delete_own"
  on public.community_reply_upvotes for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS — community_reply_downvotes
-- ---------------------------------------------------------------------------

alter table public.community_reply_downvotes enable row level security;

drop policy if exists "reply_downvotes_select_all" on public.community_reply_downvotes;
create policy "reply_downvotes_select_all"
  on public.community_reply_downvotes for select
  to authenticated
  using (true);

drop policy if exists "reply_downvotes_insert_own" on public.community_reply_downvotes;
create policy "reply_downvotes_insert_own"
  on public.community_reply_downvotes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "reply_downvotes_delete_own" on public.community_reply_downvotes;
create policy "reply_downvotes_delete_own"
  on public.community_reply_downvotes for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Refresh community_posts_with_author view
-- Adds: downvote_count, user_has_downvoted, general_tags
-- ---------------------------------------------------------------------------

drop view if exists public.community_posts_with_author;

create view public.community_posts_with_author
  with (security_invoker = true)
as
select
  cp.id,
  cp.user_id,
  cp.title,
  cp.body,
  cp.course_code,
  cp.professor_name,
  cp.is_anonymous,
  cp.general_tags,
  cp.created_at,
  cp.updated_at,
  case
    when cp.is_anonymous then 'Anonymous'
    else coalesce(p.display_name, 'Anonymous')
  end as author_display_name,
  (
    select count(*)::int
    from public.community_replies cr
    where cr.post_id = cp.id
  ) as reply_count,
  (
    select count(*)::int
    from public.community_post_upvotes cpu
    where cpu.post_id = cp.id
  ) as upvote_count,
  (
    select count(*)::int
    from public.community_post_downvotes cpd
    where cpd.post_id = cp.id
  ) as downvote_count,
  exists (
    select 1
    from public.community_post_upvotes cpu2
    where cpu2.post_id = cp.id
      and cpu2.user_id = auth.uid()
  ) as user_has_upvoted,
  exists (
    select 1
    from public.community_post_downvotes cpd2
    where cpd2.post_id = cp.id
      and cpd2.user_id = auth.uid()
  ) as user_has_downvoted
from public.community_posts cp
left join public.profiles p on p.id = cp.user_id;

-- ---------------------------------------------------------------------------
-- Refresh community_replies_with_author view
-- Adds: parent_reply_id, is_anonymous, upvote_count, downvote_count,
--       user_has_upvoted, user_has_downvoted, anonymous author masking
-- ---------------------------------------------------------------------------

drop view if exists public.community_replies_with_author;

create view public.community_replies_with_author
  with (security_invoker = true)
as
select
  cr.id,
  cr.post_id,
  cr.user_id,
  cr.body,
  cr.parent_reply_id,
  cr.is_anonymous,
  cr.created_at,
  cr.updated_at,
  case
    when cr.is_anonymous then 'Anonymous'
    else coalesce(p.display_name, 'Anonymous')
  end as author_display_name,
  (
    select count(*)::int
    from public.community_reply_upvotes cru
    where cru.reply_id = cr.id
  ) as upvote_count,
  (
    select count(*)::int
    from public.community_reply_downvotes crd
    where crd.reply_id = cr.id
  ) as downvote_count,
  exists (
    select 1
    from public.community_reply_upvotes cru2
    where cru2.reply_id = cr.id
      and cru2.user_id = auth.uid()
  ) as user_has_upvoted,
  exists (
    select 1
    from public.community_reply_downvotes crd2
    where crd2.reply_id = cr.id
      and crd2.user_id = auth.uid()
  ) as user_has_downvoted
from public.community_replies cr
left join public.profiles p on p.id = cr.user_id;
