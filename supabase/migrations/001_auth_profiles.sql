-- Vinyl account foundation: authenticated profiles, artist onboarding and avatars.
-- Run this once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (
    char_length(username) between 3 and 30
    and username ~ '^[a-z0-9][a-z0-9._-]*$'
  ),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  accent_theme text not null default 'rose' check (accent_theme in ('rose', 'sunset')),
  dark_mode boolean not null default false,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

create table if not exists public.artist_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  artist_name text not null check (char_length(artist_name) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (user_id, artist_name)
);

alter table public.profiles enable row level security;
alter table public.artist_preferences enable row level security;

create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "users read their artist preferences"
  on public.artist_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users add their artist preferences"
  on public.artist_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users remove their artist preferences"
  on public.artist_preferences for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.handle_new_vinyl_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  requested_username text;
  requested_name text;
begin
  requested_username := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    '[^a-zA-Z0-9._-]+', '-', 'g'
  ));
  requested_username := trim(both '-' from requested_username);

  if char_length(requested_username) < 3 then
    requested_username := 'listener-' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  requested_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    requested_username
  );

  insert into public.profiles (id, username, display_name)
  values (new.id, requested_username, left(requested_name, 60));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_vinyl_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public avatar viewing"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

