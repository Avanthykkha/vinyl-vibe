# Vinyl

Vinyl is a social music-discovery app built with Next.js, Supabase Auth and the
YouTube Data/Player APIs. It includes personalized discovery, cloud libraries,
custom playlists, synchronized listening parties, themes and profile avatars.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add the three required values.
3. Run both SQL files in `supabase/migrations` in numerical order.
4. Start the app with `npm run dev` and open <http://localhost:3000>.

Never commit `.env.local`. `YOUTUBE_API_KEY` is server-only; only the Supabase
URL and publishable key use the `NEXT_PUBLIC_` prefix.

## Production launch checklist

1. Run `001_auth_profiles.sql`, followed by `002_production_hardening.sql`, in
   the production Supabase SQL Editor.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
   `YOUTUBE_API_KEY` to the hosting provider's production environment. You can
   optionally set `YOUTUBE_DAILY_SEARCH_BUDGET` (defaults to `80`).
3. In Supabase **Authentication > URL Configuration**, set **Site URL** to the
   deployed HTTPS URL and add `https://your-domain/**` as a redirect URL.
4. Keep email confirmation enabled and use the callback documented in
   `supabase/README.md`.
5. Restrict the Google API key to the YouTube Data API v3. The application also
   authenticates and rate-limits uncached searches per Vinyl account.
6. Run `npm run lint` and `npm run build` before deploying.
7. Test signup, email confirmation, login, search, playback, cloud playlists,
   avatar upload and a two-browser listening party on the deployed URL.

The app requires a full Next.js server deployment; it is not compatible with a
static export because it uses authenticated Route Handlers and server APIs.
