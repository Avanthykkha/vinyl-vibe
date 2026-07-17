-- New Vinyl accounts should start with the full dark album-art experience.
-- Users can still switch to light mode from their profile settings.
alter table public.profiles
  alter column dark_mode set default true;
