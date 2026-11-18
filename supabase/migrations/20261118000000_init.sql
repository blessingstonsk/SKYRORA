-- =============================================================================
-- SKYRO — initial schema
-- Tables, indexes, row-level security, triggers, RPCs and storage policies.
-- `auth.users` (managed by Supabase Auth) is the "users" table; every user
-- gets one row in `profiles` (shareable) and one in `profile_private` (owner only).
-- =============================================================================

create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.activity_type as enum ('run','walk','ride','hike','strength','yoga','swim','other');
create type public.visibility    as enum ('public','followers','private');
create type public.follow_status as enum ('pending','accepted');
create type public.goal_type     as enum ('weight_loss','weight_gain','run_distance','weekly_workouts','daily_steps','calories','strength');
create type public.goal_status   as enum ('active','completed','archived');
create type public.challenge_metric as enum ('distance','active_days','calories','duration','count');
create type public.notification_type as enum (
  'follow_request','new_follower','like','comment','challenge_invite',
  'challenge_complete','personal_record','streak','achievement'
);

-- ---------------------------------------------------------------------------
-- Utility: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  username            citext unique not null check (username ~ '^[a-z0-9_.]{3,24}$'),
  full_name           text check (char_length(full_name) <= 60),
  bio                 text check (char_length(bio) <= 280),
  avatar_url          text,
  location_label      text check (char_length(location_label) <= 60),
  visibility          public.visibility not null default 'public',
  show_in_leaderboards boolean not null default true,
  onboarded           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index profiles_username_trgm on public.profiles using gin (username gin_trgm_ops);
create index profiles_name_trgm on public.profiles using gin (full_name gin_trgm_ops);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Sensitive body metrics & preferences: owner only, never joined into public reads.
create table public.profile_private (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  age              smallint check (age between 13 and 120),
  gender           text check (gender in ('female','male','non_binary','prefer_not')),
  height_cm        numeric(5,1) check (height_cm between 80 and 260),
  weight_kg        numeric(5,1) check (weight_kg between 20 and 400),
  fitness_goal     text check (fitness_goal in ('lose_weight','build_strength','endurance','stay_active','gain_weight')),
  activity_prefs   public.activity_type[] not null default '{}',
  units            text not null default 'metric' check (units in ('metric','imperial')),
  hide_route_ends  boolean not null default true,
  route_trim_m     smallint not null default 200 check (route_trim_m between 0 and 1000),
  updated_at       timestamptz not null default now()
);
create trigger profile_private_touch before update on public.profile_private
  for each row execute function public.touch_updated_at();

-- Privacy zones (e.g. home). Owner only. Routes are trimmed around them client-side
-- before the shareable polyline is stored.
create table public.privacy_zones (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.profiles(id) on delete cascade,
  label     text not null default 'Home',
  lat       double precision not null check (lat between -90 and 90),
  lng       double precision not null check (lng between -180 and 180),
  radius_m  smallint not null default 300 check (radius_m between 100 and 2000),
  created_at timestamptz not null default now()
);
create index privacy_zones_user on public.privacy_zones(user_id);

-- Create profile rows automatically when a user signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(regexp_replace(coalesce(split_part(new.email,'@',1),'athlete'), '[^a-z0-9_.]', '', 'g'));
  candidate text;
begin
  if char_length(base) < 3 then base := 'athlete'; end if;
  candidate := left(base, 18) || '_' || substr(md5(new.id::text), 1, 4);
  insert into public.profiles (id, username, full_name, avatar_url)
  values (new.id, candidate,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'avatar_url');
  insert into public.profile_private (user_id) values (new.id);
  insert into public.notification_prefs (user_id) values (new.id);
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Social graph
-- ---------------------------------------------------------------------------
create table public.followers (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  status       public.follow_status not null default 'accepted',
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index followers_following on public.followers(following_id, status);

create or replace function public.is_following(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from followers
                 where follower_id = viewer and following_id = target and status = 'accepted');
$$;

-- Can `viewer` see content (activities, stats) owned by `owner` at a given visibility?
create or replace function public.can_view(viewer uuid, owner uuid, vis public.visibility) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer = owner
      or (
        vis <> 'private'
        and (select p.visibility from profiles p where p.id = owner) <> 'private'
        and (
          (vis = 'public' and (select p.visibility from profiles p where p.id = owner) = 'public')
          or public.is_following(viewer, owner)
        )
      );
$$;

-- ---------------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------------
create table public.activities (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid unique,                -- idempotency key for offline sync
  user_id          uuid not null references public.profiles(id) on delete cascade,
  type             public.activity_type not null,
  title            text not null check (char_length(title) between 1 and 80),
  description      text check (char_length(description) <= 2000),
  visibility       public.visibility not null default 'public',
  started_at       timestamptz not null,
  ended_at         timestamptz,
  moving_time_s    integer not null default 0 check (moving_time_s >= 0),
  elapsed_time_s   integer not null default 0 check (elapsed_time_s >= 0),
  distance_m       numeric(10,1) not null default 0 check (distance_m >= 0),
  elevation_gain_m numeric(7,1) not null default 0,
  avg_speed_mps    numeric(6,3),
  max_speed_mps    numeric(6,3),
  avg_pace_s_km    numeric(7,1),
  calories         integer not null default 0 check (calories >= 0),
  steps            integer,
  avg_hr           smallint,
  max_hr           smallint,
  map_polyline     text,                       -- privacy-trimmed, shareable
  region_lat       numeric(6,2),               -- ~1km coarse area for "nearby"
  region_lng       numeric(6,2),
  like_count       integer not null default 0,
  comment_count    integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index activities_user_started on public.activities(user_id, started_at desc);
create index activities_feed on public.activities(started_at desc, id) where visibility <> 'private';
create index activities_region on public.activities(region_lat, region_lng) where visibility = 'public';
create index activities_title_trgm on public.activities using gin (title gin_trgm_ops);
create trigger activities_touch before update on public.activities
  for each row execute function public.touch_updated_at();

-- Raw GPS samples. Owner only (exact location is sensitive).
create table public.activity_points (
  activity_id  uuid not null references public.activities(id) on delete cascade,
  seq          integer not null,
  lat          double precision not null,
  lng          double precision not null,
  altitude_m   real,
  speed_mps    real,
  accuracy_m   real,
  heart_rate   smallint,
  recorded_at  timestamptz not null,
  primary key (activity_id, seq)
);

-- Derived per-activity stats (splits, best efforts).
create table public.activity_stats (
  activity_id  uuid primary key references public.activities(id) on delete cascade,
  splits       jsonb not null default '[]',   -- [{km, seconds, elevation}]
  best_efforts jsonb not null default '{}',   -- {"1k": seconds, "5k": seconds}
  hr_zones     jsonb,
  created_at   timestamptz not null default now()
);

create table public.activity_photos (
  id            uuid primary key default gen_random_uuid(),
  activity_id   uuid not null references public.activities(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  storage_path  text not null unique,
  width         integer,
  height        integer,
  created_at    timestamptz not null default now()
);
create index activity_photos_activity on public.activity_photos(activity_id);

-- ---------------------------------------------------------------------------
-- Strength training
-- ---------------------------------------------------------------------------
create table public.exercises (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 60),
  category     text not null default 'strength' check (category in ('strength','core','cardio','mobility')),
  muscle_group text,
  created_by   uuid references public.profiles(id) on delete cascade, -- null = built-in
  created_at   timestamptz not null default now(),
  unique nulls not distinct (created_by, name)
);

create table public.workouts (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique references public.activities(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  notes       text check (char_length(notes) <= 1000),
  created_at  timestamptz not null default now()
);

create table public.workout_sets (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references public.workouts(id) on delete cascade,
  exercise_id  uuid not null references public.exercises(id) on delete restrict,
  set_index    smallint not null,
  reps         smallint check (reps between 0 and 1000),
  weight_kg    numeric(6,2) check (weight_kg between 0 and 1000),
  rest_s       smallint check (rest_s between 0 and 3600),
  duration_s   integer check (duration_s between 0 and 86400),
  created_at   timestamptz not null default now()
);
create index workout_sets_workout on public.workout_sets(workout_id, set_index);
create index workout_sets_exercise on public.workout_sets(exercise_id);

-- ---------------------------------------------------------------------------
-- Likes & comments
-- ---------------------------------------------------------------------------
create table public.likes (
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (activity_id, user_id)
);
create index likes_user on public.likes(user_id);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index comments_activity on public.comments(activity_id, created_at);

-- ---------------------------------------------------------------------------
-- Challenges & achievements
-- ---------------------------------------------------------------------------
create table public.achievements (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  title       text not null,
  description text not null,
  icon        text not null default 'trophy',
  tier        text not null default 'gold' check (tier in ('bronze','silver','gold','platinum')),
  created_at  timestamptz not null default now()
);

create table public.challenges (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  title          text not null,
  description    text not null,
  metric         public.challenge_metric not null,
  activity_types public.activity_type[] not null default '{}', -- empty = any
  target_value   numeric not null check (target_value > 0),
  unit           text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  achievement_id uuid references public.achievements(id),
  accent         text not null default '#2EE6C5',
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index challenges_window on public.challenges(ends_at desc, starts_at);

create table public.challenge_participants (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  progress     numeric not null default 0,
  joined_at    timestamptz not null default now(),
  completed_at timestamptz,
  primary key (challenge_id, user_id)
);
create index challenge_participants_rank on public.challenge_participants(challenge_id, progress desc);
create index challenge_participants_user on public.challenge_participants(user_id);

create table public.user_achievements (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  activity_id    uuid references public.activities(id) on delete set null,
  earned_at      timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.personal_records (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  record      text not null check (record in ('fastest_1k','fastest_5k','fastest_10k','longest_run','longest_ride','longest_walk','most_calories','most_active_week','longest_streak')),
  value       numeric not null,
  activity_id uuid references public.activities(id) on delete set null,
  achieved_at timestamptz not null default now(),
  primary key (user_id, record)
);

-- ---------------------------------------------------------------------------
-- Goals & weight
-- ---------------------------------------------------------------------------
create table public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  type         public.goal_type not null,
  title        text not null check (char_length(title) between 1 and 80),
  target_value numeric not null check (target_value > 0),
  start_value  numeric,
  unit         text not null,
  exercise_id  uuid references public.exercises(id) on delete set null,
  deadline     date,
  status       public.goal_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index goals_user on public.goals(user_id, status);
create trigger goals_touch before update on public.goals
  for each row execute function public.touch_updated_at();

create table public.weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  weight_kg  numeric(5,1) not null check (weight_kg between 20 and 400),
  logged_on  date not null default current_date,
  note       text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);
create index weight_logs_user_date on public.weight_logs(user_id, logged_on desc);

-- ---------------------------------------------------------------------------
-- Routes (Explore)
-- ---------------------------------------------------------------------------
create table public.routes (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  type             public.activity_type not null,
  distance_m       numeric(10,1) not null,
  elevation_gain_m numeric(7,1) not null default 0,
  map_polyline     text not null,
  region_lat       numeric(6,2),
  region_lng       numeric(6,2),
  region_label     text,
  times_completed  integer not null default 0,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index routes_type_pop on public.routes(type, times_completed desc);
create index routes_name_trgm on public.routes using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notification_prefs (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  follow_requests  boolean not null default true,
  new_followers    boolean not null default true,
  likes            boolean not null default true,
  comments         boolean not null default true,
  challenges       boolean not null default true,
  records          boolean not null default true,
  streaks          boolean not null default true,
  push_token       text,
  updated_at       timestamptz not null default now()
);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete cascade,
  type         public.notification_type not null,
  activity_id  uuid references public.activities(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete cascade,
  data         jsonb not null default '{}',
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_user on public.notifications(user_id, created_at desc);
create index notifications_unread on public.notifications(user_id) where read_at is null;

-- Now that notification_prefs exists, wire up the signup trigger.
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Insert a notification honouring the recipient's preferences.
create or replace function public.notify(
  recipient uuid, actor uuid, kind public.notification_type,
  act uuid default null, chal uuid default null, payload jsonb default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare p notification_prefs;
begin
  if recipient is null or recipient = actor then return; end if;
  select * into p from notification_prefs where user_id = recipient;
  if p is not null and not case kind
      when 'follow_request'     then p.follow_requests
      when 'new_follower'       then p.new_followers
      when 'like'               then p.likes
      when 'comment'            then p.comments
      when 'challenge_invite'   then p.challenges
      when 'challenge_complete' then p.challenges
      when 'personal_record'    then p.records
      when 'achievement'        then p.records
      when 'streak'             then p.streaks
    end then return; end if;
  insert into notifications (user_id, actor_id, type, activity_id, challenge_id, data)
  values (recipient, actor, kind, act, chal, payload);
end $$;

-- ---------------------------------------------------------------------------
-- Rate limiting (per user, per table, sliding window)
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  max_rows int := tg_argv[0]::int;
  window_s int := tg_argv[1]::int;
  owner_col text := coalesce(tg_argv[2], 'user_id');
  recent int;
begin
  execute format('select count(*) from %I.%I where %I = $1 and created_at > now() - make_interval(secs => $2)',
                 tg_table_schema, tg_table_name, owner_col)
    into recent using (to_jsonb(new) ->> owner_col)::uuid, window_s;
  if recent >= max_rows then
    raise exception 'Rate limit exceeded, please slow down' using errcode = 'P0429';
  end if;
  return new;
end $$;

create trigger comments_rate  before insert on public.comments   for each row execute function public.rate_limit('10', '60');
create trigger likes_rate     before insert on public.likes      for each row execute function public.rate_limit('60', '60');
create trigger follows_rate   before insert on public.followers  for each row execute function public.rate_limit('30', '60', 'follower_id');
create trigger activities_rate before insert on public.activities for each row execute function public.rate_limit('30', '3600');
create trigger weights_rate   before insert on public.weight_logs for each row execute function public.rate_limit('20', '3600');

-- ---------------------------------------------------------------------------
-- Social triggers: counters + notifications
-- ---------------------------------------------------------------------------
create or replace function public.on_like_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update activities set like_count = like_count + 1 where id = new.activity_id;
    perform notify((select user_id from activities where id = new.activity_id), new.user_id, 'like', new.activity_id);
    return new;
  else
    update activities set like_count = greatest(like_count - 1, 0) where id = old.activity_id;
    return old;
  end if;
end $$;
create trigger likes_after after insert or delete on public.likes
  for each row execute function public.on_like_change();

create or replace function public.on_comment_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update activities set comment_count = comment_count + 1 where id = new.activity_id;
    perform notify((select user_id from activities where id = new.activity_id), new.user_id, 'comment',
                   new.activity_id, null, jsonb_build_object('preview', left(new.body, 80)));
    return new;
  else
    update activities set comment_count = greatest(comment_count - 1, 0) where id = old.activity_id;
    return old;
  end if;
end $$;
create trigger comments_after after insert or delete on public.comments
  for each row execute function public.on_comment_change();

-- Following a non-public profile creates a pending request.
create or replace function public.on_follow_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare vis visibility;
begin
  select visibility into vis from profiles where id = new.following_id;
  if vis <> 'public' then new.status := 'pending'; else new.status := 'accepted'; end if;
  return new;
end $$;
create trigger followers_before before insert on public.followers
  for each row execute function public.on_follow_insert();

create or replace function public.on_follow_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform notify(new.following_id, new.follower_id,
                   case when new.status = 'pending' then 'follow_request' else 'new_follower' end);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform notify(new.follower_id, new.following_id, 'new_follower', null, null, '{"accepted":true}');
  end if;
  return new;
end $$;
create trigger followers_after after insert or update on public.followers
  for each row execute function public.on_follow_after();

-- ---------------------------------------------------------------------------
-- Challenge progress, achievements, streaks & personal records
-- ---------------------------------------------------------------------------
create or replace function public.current_streak(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  with days as (
    select distinct (started_at at time zone 'utc')::date d from activities where user_id = uid
  ), numbered as (
    select d, d - (row_number() over (order by d))::int grp from days
  ), runs as (
    select grp, max(d) last_day, count(*) len from numbered group by grp
  )
  select coalesce((select len::int from runs where last_day >= current_date - 1 order by last_day desc limit 1), 0);
$$;

create or replace function public.award(uid uuid, code_ text, act uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare a achievements;
begin
  select * into a from achievements where code = code_;
  if a is null then return; end if;
  insert into user_achievements (user_id, achievement_id, activity_id) values (uid, a.id, act)
  on conflict do nothing;
  if found then
    perform notify(uid, null, 'achievement', act, null, jsonb_build_object('title', a.title, 'icon', a.icon));
  end if;
end $$;

create or replace function public.refresh_user_progress(uid uuid, act uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  c record;
  val numeric;
  streak int;
begin
  -- Challenges the user has joined and that are running.
  for c in
    select ch.*, cp.completed_at from challenges ch
    join challenge_participants cp on cp.challenge_id = ch.id and cp.user_id = uid
  loop
    select case c.metric
             when 'distance'    then coalesce(sum(a.distance_m) / 1000.0, 0)
             when 'calories'    then coalesce(sum(a.calories), 0)
             when 'duration'    then coalesce(sum(a.moving_time_s) / 60.0, 0)
             when 'count'       then count(*)
             when 'active_days' then count(distinct (a.started_at at time zone 'utc')::date)
           end
      into val
      from activities a
     where a.user_id = uid
       and a.started_at between c.starts_at and c.ends_at
       and (cardinality(c.activity_types) = 0 or a.type = any(c.activity_types));

    update challenge_participants
       set progress = round(val, 2),
           completed_at = case when val >= c.target_value then coalesce(completed_at, now()) else null end
     where challenge_id = c.id and user_id = uid;

    if val >= c.target_value and c.completed_at is null then
      perform notify(uid, null, 'challenge_complete', act, c.id, jsonb_build_object('title', c.title));
      if c.achievement_id is not null then
        insert into user_achievements (user_id, achievement_id, activity_id)
        values (uid, c.achievement_id, act) on conflict do nothing;
      end if;
    end if;
  end loop;

  -- Milestones
  if (select count(*) from activities where user_id = uid) >= 1 then perform award(uid, 'first_activity', act); end if;
  if (select count(*) from activities where user_id = uid) >= 50 then perform award(uid, 'fifty_activities', act); end if;
  if (select coalesce(sum(distance_m),0) from activities where user_id = uid) >= 100000 then perform award(uid, 'distance_100k', act); end if;

  streak := current_streak(uid);
  if streak in (3, 7, 14, 30, 60, 100) then
    perform notify(uid, null, 'streak', act, null, jsonb_build_object('days', streak));
  end if;
  if streak >= 7 then perform award(uid, 'streak_7', act); end if;
  if streak >= 30 then perform award(uid, 'streak_30', act); end if;

  insert into personal_records (user_id, record, value, activity_id)
  values (uid, 'longest_streak', streak, act)
  on conflict (user_id, record) do update set value = excluded.value, achieved_at = now(), activity_id = excluded.activity_id
  where personal_records.value < excluded.value;
end $$;

create or replace function public.upsert_record(uid uuid, rec text, val numeric, act uuid, lower_is_better boolean)
returns void language plpgsql security definer set search_path = public as $$
declare prev numeric;
begin
  if val is null or val <= 0 then return; end if;
  select value into prev from personal_records where user_id = uid and record = rec;
  if prev is null or (lower_is_better and val < prev) or (not lower_is_better and val > prev) then
    insert into personal_records (user_id, record, value, activity_id, achieved_at)
    values (uid, rec, val, act, now())
    on conflict (user_id, record) do update set value = excluded.value, activity_id = excluded.activity_id, achieved_at = now();
    if prev is not null then
      perform notify(uid, null, 'personal_record', act, null, jsonb_build_object('record', rec, 'value', val, 'previous', prev));
    end if;
  end if;
end $$;

create or replace function public.on_activity_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := coalesce(new.user_id, old.user_id);
begin
  if tg_op <> 'DELETE' then
    if new.type = 'run'  then perform upsert_record(uid, 'longest_run',  new.distance_m, new.id, false); end if;
    if new.type = 'ride' then perform upsert_record(uid, 'longest_ride', new.distance_m, new.id, false); end if;
    if new.type = 'walk' then perform upsert_record(uid, 'longest_walk', new.distance_m, new.id, false); end if;
    perform upsert_record(uid, 'most_calories', new.calories, new.id, false);
    perform upsert_record(uid, 'most_active_week', (
      select sum(moving_time_s) from activities
       where user_id = uid and date_trunc('week', started_at) = date_trunc('week', new.started_at)), new.id, false);
  end if;
  perform refresh_user_progress(uid, case when tg_op = 'DELETE' then null else new.id end);
  return null;
end $$;
create trigger activities_after after insert or update of distance_m, moving_time_s, calories, started_at, type or delete
  on public.activities for each row execute function public.on_activity_change();

create or replace function public.on_stats_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid; t activity_type;
begin
  select user_id, type into uid, t from activities where id = new.activity_id;
  if t = 'run' then
    perform upsert_record(uid, 'fastest_1k',  (new.best_efforts->>'1k')::numeric,  new.activity_id, true);
    perform upsert_record(uid, 'fastest_5k',  (new.best_efforts->>'5k')::numeric,  new.activity_id, true);
    perform upsert_record(uid, 'fastest_10k', (new.best_efforts->>'10k')::numeric, new.activity_id, true);
  end if;
  return null;
end $$;
create trigger activity_stats_after after insert or update on public.activity_stats
  for each row execute function public.on_stats_insert();

-- Joining a challenge computes progress immediately.
create or replace function public.on_join_challenge() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform refresh_user_progress(new.user_id); return null; end $$;
create trigger challenge_join_after after insert on public.challenge_participants
  for each row execute function public.on_join_challenge();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Leaderboard: metric in ('distance','calories','count','duration'), scope in ('friends','local','global')
create or replace function public.leaderboard(metric text, since timestamptz, scope text default 'global', lim int default 50)
returns table (user_id uuid, username citext, full_name text, avatar_url text, value numeric, rank bigint)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() uid),
  my_region as (
    select region_lat, region_lng from activities, me where user_id = me.uid and region_lat is not null
    order by started_at desc limit 1
  ),
  eligible as (
    select p.* from profiles p, me
     where p.id = me.uid
        or (p.show_in_leaderboards and p.visibility <> 'private'
            and (scope <> 'friends' or public.is_following(me.uid, p.id))
            and (p.visibility = 'public' or public.is_following(me.uid, p.id)))
  ),
  agg as (
    select a.user_id,
           case metric
             when 'distance' then sum(a.distance_m) / 1000.0
             when 'calories' then sum(a.calories)
             when 'duration' then sum(a.moving_time_s) / 3600.0
             else count(*) end as value
      from activities a
      join eligible e on e.id = a.user_id
     where a.started_at >= since
       and (a.visibility <> 'private' or a.user_id = (select uid from me))
       and (scope <> 'local' or exists (
             select 1 from my_region r
              where abs(a.region_lat - r.region_lat) <= 0.5 and abs(a.region_lng - r.region_lng) <= 0.5))
     group by a.user_id
  )
  select e.id, e.username, e.full_name, e.avatar_url, round(agg.value, 1), rank() over (order by agg.value desc)
    from agg join eligible e on e.id = agg.user_id
   order by agg.value desc
   limit greatest(1, least(lim, 100));
$$;

create or replace function public.challenge_leaderboard(chal uuid, lim int default 50)
returns table (user_id uuid, username citext, full_name text, avatar_url text, progress numeric, completed_at timestamptz, rank bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, cp.progress, cp.completed_at,
         rank() over (order by cp.progress desc)
    from challenge_participants cp
    join profiles p on p.id = cp.user_id
   where cp.challenge_id = chal
     and (p.id = auth.uid() or (p.show_in_leaderboards and p.visibility <> 'private'))
   order by cp.progress desc
   limit greatest(1, least(lim, 100));
$$;

-- Permanently delete the calling user's account and all owned data (cascades).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from storage.objects where owner = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Internal helpers are not callable from the API.
revoke execute on function public.notify(uuid, uuid, public.notification_type, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.award(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.refresh_user_progress(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.upsert_record(uuid, text, numeric, uuid, boolean) from public, anon, authenticated;

-- =============================================================================
-- Row-level security
-- =============================================================================
alter table public.profiles               enable row level security;
alter table public.profile_private        enable row level security;
alter table public.privacy_zones          enable row level security;
alter table public.followers              enable row level security;
alter table public.activities             enable row level security;
alter table public.activity_points        enable row level security;
alter table public.activity_stats         enable row level security;
alter table public.activity_photos        enable row level security;
alter table public.exercises              enable row level security;
alter table public.workouts               enable row level security;
alter table public.workout_sets           enable row level security;
alter table public.likes                  enable row level security;
alter table public.comments               enable row level security;
alter table public.achievements           enable row level security;
alter table public.challenges             enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.user_achievements      enable row level security;
alter table public.personal_records       enable row level security;
alter table public.goals                  enable row level security;
alter table public.weight_logs            enable row level security;
alter table public.routes                 enable row level security;
alter table public.notification_prefs     enable row level security;
alter table public.notifications          enable row level security;

-- Profiles: basic identity is discoverable by signed-in users (needed to follow/request).
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "private self" on public.profile_private for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "zones self" on public.privacy_zones for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Followers
create policy "follows visible to parties or public" on public.followers for select to authenticated
  using (follower_id = auth.uid() or following_id = auth.uid() or status = 'accepted');
create policy "follow as self" on public.followers for insert to authenticated
  with check (follower_id = auth.uid());
create policy "accept requests" on public.followers for update to authenticated
  using (following_id = auth.uid()) with check (following_id = auth.uid() and status = 'accepted');
create policy "unfollow or remove" on public.followers for delete to authenticated
  using (follower_id = auth.uid() or following_id = auth.uid());

-- Activities
create policy "activities visible" on public.activities for select to authenticated
  using (public.can_view(auth.uid(), user_id, visibility));
create policy "activities insert own" on public.activities for insert to authenticated
  with check (user_id = auth.uid());
create policy "activities update own" on public.activities for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "activities delete own" on public.activities for delete to authenticated
  using (user_id = auth.uid());

-- Raw points: owner only.
create policy "points owner" on public.activity_points for all to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and a.user_id = auth.uid()))
  with check (exists (select 1 from activities a where a.id = activity_id and a.user_id = auth.uid()));

create policy "stats visible" on public.activity_stats for select to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and public.can_view(auth.uid(), a.user_id, a.visibility)));
create policy "stats owner write" on public.activity_stats for all to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and a.user_id = auth.uid()))
  with check (exists (select 1 from activities a where a.id = activity_id and a.user_id = auth.uid()));

create policy "photos visible" on public.activity_photos for select to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and public.can_view(auth.uid(), a.user_id, a.visibility)));
create policy "photos owner write" on public.activity_photos for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from activities a where a.id = activity_id and a.user_id = auth.uid()));

-- Exercises: built-ins readable by all, custom ones by their owner.
create policy "exercises read" on public.exercises for select to authenticated
  using (created_by is null or created_by = auth.uid());
create policy "exercises custom write" on public.exercises for all to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "workouts visible" on public.workouts for select to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and public.can_view(auth.uid(), a.user_id, a.visibility)));
create policy "workouts owner write" on public.workouts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sets visible" on public.workout_sets for select to authenticated
  using (exists (select 1 from workouts w join activities a on a.id = w.activity_id
                 where w.id = workout_id and public.can_view(auth.uid(), a.user_id, a.visibility)));
create policy "sets owner write" on public.workout_sets for all to authenticated
  using (exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()));

-- Likes & comments: only on activities you can see.
create policy "likes visible" on public.likes for select to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and public.can_view(auth.uid(), a.user_id, a.visibility)));
create policy "like as self" on public.likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from activities a where a.id = activity_id and public.can_view(auth.uid(), a.user_id, a.visibility)));
create policy "unlike own" on public.likes for delete to authenticated using (user_id = auth.uid());

create policy "comments visible" on public.comments for select to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and public.can_view(auth.uid(), a.user_id, a.visibility)));
create policy "comment as self" on public.comments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from activities a where a.id = activity_id and public.can_view(auth.uid(), a.user_id, a.visibility)));
create policy "delete own comment or on own activity" on public.comments for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from activities a where a.id = activity_id and a.user_id = auth.uid()));

-- Catalogue tables: read-only for clients.
create policy "achievements read" on public.achievements for select to authenticated using (true);
create policy "challenges read" on public.challenges for select to authenticated using (true);
create policy "routes read" on public.routes for select to authenticated using (true);

create policy "participants read" on public.challenge_participants for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = user_id and p.visibility <> 'private' and p.show_in_leaderboards));
create policy "join as self" on public.challenge_participants for insert to authenticated
  with check (user_id = auth.uid() and progress = 0 and completed_at is null);
create policy "leave as self" on public.challenge_participants for delete to authenticated
  using (user_id = auth.uid());

create policy "user achievements read" on public.user_achievements for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = user_id and p.visibility = 'public')
         or public.is_following(auth.uid(), user_id));
create policy "records read" on public.personal_records for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = user_id and p.visibility = 'public')
         or public.is_following(auth.uid(), user_id));

create policy "goals self" on public.goals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "weights self" on public.weight_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "prefs self" on public.notification_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications self read" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "notifications self update" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications self delete" on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- Clients may only flip read_at on notifications.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
-- Denormalised counters are maintained by triggers only.
revoke update on public.activities from authenticated;
grant update (type, title, description, visibility, map_polyline) on public.activities to authenticated;

-- =============================================================================
-- Realtime
-- =============================================================================
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.comments;

-- =============================================================================
-- Storage
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp']),
       ('activity-photos', 'activity-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Files live under "<user_id>/<file>".
create policy "avatar public read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatar owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());
create policy "avatar owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());

create policy "photo owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'activity-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photo owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'activity-photos' and owner = auth.uid());
create policy "photo visible with activity" on storage.objects for select to authenticated
  using (bucket_id = 'activity-photos' and (
    owner = auth.uid() or exists (
      select 1 from public.activity_photos ph join public.activities a on a.id = ph.activity_id
       where ph.storage_path = name and public.can_view(auth.uid(), a.user_id, a.visibility))));
