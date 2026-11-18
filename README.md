# SKYRO

Fitness tracking and social workouts. Record GPS runs, walks, rides and hikes, log gym sessions, track weight and goals, follow friends, join challenges and earn badges.

Built with **Expo SDK 58 (React Native, TypeScript, Expo Router)** and **Supabase** (Postgres + RLS, Auth, Storage, Realtime).

## Quick start (demo mode, no backend)

```bash
npm install
npx expo start          # press w for web, or scan with a dev build
```

With no Supabase keys, SKYRO runs on an **on-device demo backend** seeded with six months of sample data, friends, challenges and weight history. On the welcome screen tap **Explore the demo account** (or sign in with `demo@skyro.app` / `skyro2026`). On the Record screen, **Simulate GPS** lets you test recording without moving.

## Going live with Supabase

1. Create a Supabase project.
2. Apply the schema, then the catalogue seed:
   ```bash
   npx supabase db push            # or paste supabase/migrations/*.sql into the SQL editor
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```
3. Copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
4. **Google sign-in:** enable the Google provider in Supabase Auth. Add `skyro://auth-callback` (native) and your web origin plus `/auth-callback` to the allowed redirect URLs.
5. **Android maps:** set `GOOGLE_MAPS_ANDROID_KEY` (iOS uses Apple Maps).
6. Background GPS, maps and the pedometer need a **development build**, not Expo Go:
   ```bash
   npx eas-cli@latest build --profile development --platform android
   ```

## Architecture

```
src/app/            Expo Router screens (tabs: Home · Explore · Record · Challenges · Profile)
src/components/     UI kit, SVG charts, route maps, cards
src/data/
  backend.ts        The single data contract used by the UI
  supabase.ts       Production implementation (RLS-enforced)
  local.ts          On-device demo implementation (same behaviour)
  hooks.ts          React Query: caching, pagination, optimistic likes
  outbox.ts         Offline-first save queue, synced when connectivity returns
src/lib/
  geo.ts            Haversine distance, GPS spike filtering, splits, best efforts,
                    privacy trimming, Douglas-Peucker simplification, polyline codec
  tracker.ts        Background location task, web geolocation, simulator, pedometer, battery
  stats.ts          Streaks, analytics buckets, PR detection, weight trend and ETA, goal progress
src/state/          Recorder store (crash-safe snapshots) and auth gating
supabase/           SQL migration (tables, indexes, RLS, triggers, RPCs, storage) and seed
```

### Security and privacy
- Row-level security on every table. Activities are visible based on the activity's visibility *and* the owner's profile visibility (public, followers-only or private). Following a non-public profile creates a pending request.
- Raw GPS points (`activity_points`) are **owner-only**. Others see a privacy-trimmed, simplified polyline. By default the first and last 200 m are hidden (configurable), and "nearby" uses a coarse ~1 km area.
- Body metrics live in `profile_private` (owner-only), separate from the shareable profile.
- Database-side rate limits on comments, likes, follows, activities and weigh-ins. Clients can only update `read_at` on notifications, and like/comment counters are trigger-maintained.
- Activity photos are in a private bucket and served through short-lived signed URLs. Uploads are compressed (max 1600 px JPEG) and limited by MIME type and size.
- Auth tokens are stored in the OS keychain via expo-secure-store. The React Query cache is cleared on account switch.
- Account deletion (`delete_my_account` RPC) cascades all owned data.

### Performance
- Offline outbox with idempotent uploads (`client_id` + `ON CONFLICT DO NOTHING`), so retries never duplicate.
- Feeds use cursor pagination and render SVG route previews instead of live map tiles.
- GPS: High accuracy with a 4–8 m distance filter, spike rejection and elevation hysteresis.

## Status

**Done (MVP):** auth (email, Google, reset), onboarding and profile, dashboard, GPS run/walk/ride/hike recording, workout summary (PRs and comparisons), activity history and detail, manual and gym logging with custom exercises, weight tracking, goals, social feed with likes and comments, follow and requests, explore and search, challenges with leaderboards, badges, personal records, analytics (7D–1Y), leaderboards (friends/local/global), notifications (realtime) and preferences, privacy controls, dark/light themes.

**Verified:** TypeScript and ESLint pass. The full app was exercised on web in demo mode: every screen renders, and record → finish → save → detail works.

**Not yet verified:** on a physical device (background GPS, maps, pedometer), and against a real Supabase project (the SQL migration hasn't been run).

**Phase 2:** push notification delivery (prefs and `push_token` column exist), wearable heart-rate integrations, AI fitness assistant, advanced gym analytics.

SKYRO shows estimates and trends only. It is not a medical device and does not provide medical advice.
