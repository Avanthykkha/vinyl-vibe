# Vinyl backend setup

The codebase automatically uses Supabase when both public Supabase environment
variables are present. Until then, Vinyl keeps its previous local-only login so
development is not blocked.

## 1. Create the project

1. Create a project at <https://database.new>.
2. Open **SQL Editor** in the Supabase dashboard.
3. Paste and run `supabase/migrations/001_auth_profiles.sql` once.
4. Paste and run `supabase/migrations/002_production_hardening.sql` once.

These create authenticated profiles, case-insensitive unique usernames, artist
preferences, cloud music libraries, durable listening parties, server-side
search throttling, Row Level Security policies, and the avatar bucket.

## 2. Add local environment variables

Copy `.env.example` to `.env.local` and replace the placeholders with values
from the Supabase project's **Connect** dialog:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
YOUTUBE_API_KEY=your_server_side_youtube_key
```

The publishable key is intended for browser use and is restricted by RLS. Never
put a Supabase secret/service-role key or the YouTube key in a `NEXT_PUBLIC_`
variable.

Restart `npm run dev` after changing environment variables.

## 3. Configure confirmation emails

In **Authentication > URL Configuration**:

- Set the Site URL to the deployed Vinyl URL.
- Add `http://localhost:3000/**` for local development.
- Add `https://your-production-domain/**` for production.

In **Authentication > Email Templates > Confirm signup**, use this link:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">
  Confirm your Vinyl account
</a>
```

Keep email confirmation enabled for public accounts. New listeners confirm the
email, sign in, and then complete artist onboarding.

## 4. Verify

1. Create an account with a new email and username.
2. Confirm the email.
3. Sign in and select at least three artists.
4. Change the display name/theme and press **Save profile**.
5. Upload an avatar, sign out, and sign back in.
6. Confirm `/home` and `/party/<code>` redirect signed-out visitors to `/`.

Likes, listening history, playlists and queues now migrate from the listener's
existing device into `music_libraries` on the first login after migration 002.
Local storage remains as a fast offline cache; Supabase is the account source of
truth. Party rooms, queues and active membership are stored in Supabase so they
survive deployments and work across multiple server instances.
