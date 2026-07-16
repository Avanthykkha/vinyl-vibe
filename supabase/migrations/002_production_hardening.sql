-- Persistent libraries, listening parties and server-side search throttling.
-- Run after 001_auth_profiles.sql in the Supabase SQL Editor.

create table if not exists public.music_libraries (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  liked_songs jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  playlists jsonb not null default '[]'::jsonb,
  followed_artists jsonb not null default '[]'::jsonb,
  preferred_artists jsonb not null default '[]'::jsonb,
  hidden_home_song_ids jsonb not null default '[]'::jsonb,
  not_interested_artists jsonb not null default '[]'::jsonb,
  queue jsonb not null default '[]'::jsonb,
  autoplay_enabled boolean not null default true,
  device_migrated boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.music_libraries
  add column if not exists device_migrated boolean not null default false;

alter table public.music_libraries enable row level security;

create policy "users read their own music library"
  on public.music_libraries for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users create their own music library"
  on public.music_libraries for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update their own music library"
  on public.music_libraries for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.party_rooms (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  created_by uuid not null references public.profiles(id) on delete cascade,
  song jsonb,
  is_playing boolean not null default false,
  loop_enabled boolean not null default false,
  position double precision not null default 0 check (position >= 0),
  queue jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.party_members (
  room_code text not null references public.party_rooms(code) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  last_seen timestamptz not null default now(),
  primary key (room_code, user_id)
);

create index if not exists party_members_room_seen_index
  on public.party_members (room_code, last_seen desc);

alter table public.party_rooms enable row level security;
alter table public.party_members enable row level security;

-- Room codes are unguessable invitations. Every party operation still requires
-- an authenticated Vinyl account; the API never exposes an anonymous room.
create policy "authenticated listeners read party rooms"
  on public.party_rooms for select to authenticated using (true);
create policy "authenticated listeners create party rooms"
  on public.party_rooms for insert to authenticated
  with check ((select auth.uid()) = created_by);
create policy "authenticated listeners update party rooms"
  on public.party_rooms for update to authenticated using (true) with check (true);

create policy "authenticated listeners read party members"
  on public.party_members for select to authenticated using (true);
create policy "listeners join parties as themselves"
  on public.party_members for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "listeners refresh their own party presence"
  on public.party_members for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "listeners leave parties as themselves"
  on public.party_members for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.search_rate_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.search_rate_limits enable row level security;

create table if not exists public.youtube_api_daily_budget (
  usage_date date primary key default current_date,
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.youtube_api_daily_budget enable row level security;

create or replace function public.consume_youtube_search_quota(
  request_limit integer default 12,
  window_seconds integer default 60,
  daily_limit integer default 80
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  listener_id uuid := auth.uid();
  user_allowed boolean;
  daily_allowed boolean;
begin
  if listener_id is null then
    return false;
  end if;

  insert into public.search_rate_limits (
    user_id,
    window_started_at,
    request_count
  )
  values (listener_id, now(), 1)
  on conflict (user_id) do update set
    window_started_at = case
      when public.search_rate_limits.window_started_at <=
        now() - make_interval(secs => greatest(window_seconds, 1))
      then now()
      else public.search_rate_limits.window_started_at
    end,
    request_count = case
      when public.search_rate_limits.window_started_at <=
        now() - make_interval(secs => greatest(window_seconds, 1))
      then 1
      else public.search_rate_limits.request_count + 1
    end
  returning request_count <= greatest(request_limit, 1) into user_allowed;

  if not user_allowed then
    return false;
  end if;

  insert into public.youtube_api_daily_budget (usage_date, request_count)
  values (current_date, 1)
  on conflict (usage_date) do update set
    request_count = public.youtube_api_daily_budget.request_count + 1
  returning request_count <= greatest(daily_limit, 1) into daily_allowed;

  return daily_allowed;
end;
$$;

revoke all on function public.consume_youtube_search_quota(integer, integer, integer)
  from public, anon;
grant execute on function public.consume_youtube_search_quota(integer, integer, integer)
  to authenticated;
