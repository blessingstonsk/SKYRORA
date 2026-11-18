-- SKYRO catalogue seed: achievements, built-in exercises, challenges, routes.

insert into public.achievements (code, title, description, icon, tier) values
  ('first_activity',   'First Steps',        'Record your first activity.',                 'footsteps', 'bronze'),
  ('fifty_activities', 'Half Century',       'Complete 50 activities.',                     'medal',     'gold'),
  ('distance_100k',    '100K Club',          'Cover 100 km in total.',                      'trophy',    'silver'),
  ('streak_7',         'Week Warrior',       'Be active 7 days in a row.',                  'flame',     'silver'),
  ('streak_30',        'Unbreakable',        'Be active 30 days in a row.',                 'flame',     'platinum'),
  ('chal_10k',         '10K Week',           'Completed the 10K Weekly challenge.',         'ribbon',    'bronze'),
  ('chal_100k',        'Century Month',      'Completed the 100K Monthly challenge.',       'trophy',    'gold'),
  ('chal_30day',       'Every Single Day',   'Completed the 30-Day Activity challenge.',    'calendar',  'gold'),
  ('chal_calorie',     'Furnace',            'Completed the Calorie challenge.',            'flame',     'silver')
on conflict (code) do nothing;

insert into public.exercises (name, category, muscle_group) values
  ('Bench Press','strength','Chest'), ('Incline Dumbbell Press','strength','Chest'),
  ('Squat','strength','Legs'), ('Deadlift','strength','Back'), ('Romanian Deadlift','strength','Hamstrings'),
  ('Lat Pulldown','strength','Back'), ('Seated Row','strength','Back'), ('Pull-up','strength','Back'),
  ('Shoulder Press','strength','Shoulders'), ('Lateral Raise','strength','Shoulders'),
  ('Bicep Curl','strength','Arms'), ('Hammer Curl','strength','Arms'), ('Tricep Extension','strength','Arms'),
  ('Tricep Pushdown','strength','Arms'), ('Leg Press','strength','Legs'), ('Leg Curl','strength','Hamstrings'),
  ('Leg Extension','strength','Quads'), ('Calf Raise','strength','Calves'), ('Hip Thrust','strength','Glutes'),
  ('Plank','core','Core'), ('Crunch','core','Core'), ('Hanging Leg Raise','core','Core'),
  ('Russian Twist','core','Core'), ('Ab Wheel','core','Core'), ('Push-up','strength','Chest')
on conflict do nothing;

-- Rolling challenges: current week / month.
insert into public.challenges (slug, title, description, metric, activity_types, target_value, unit, starts_at, ends_at, achievement_id, accent)
select 'weekly-10k', '10K Week', 'Run 10 km this week. Any pace counts.', 'distance', '{run}', 10, 'km',
       date_trunc('week', now()), date_trunc('week', now()) + interval '7 days' - interval '1 second',
       (select id from achievements where code = 'chal_10k'), '#2EE6C5'
union all
select 'monthly-100k', '100K Month', 'Complete 100 km across runs, rides and walks this month.', 'distance', '{}', 100, 'km',
       date_trunc('month', now()), date_trunc('month', now()) + interval '1 month' - interval '1 second',
       (select id from achievements where code = 'chal_100k'), '#7C5CFF'
union all
select '30-day-active', '30-Day Streak', 'Complete at least one activity every day for 30 days.', 'active_days', '{}', 30, 'days',
       date_trunc('day', now()) - interval '10 days', date_trunc('day', now()) + interval '20 days',
       (select id from achievements where code = 'chal_30day'), '#FFB547'
union all
select 'calorie-5000', 'Burn 5,000', 'Burn 5,000 active calories this month.', 'calories', '{}', 5000, 'kcal',
       date_trunc('month', now()), date_trunc('month', now()) + interval '1 month' - interval '1 second',
       (select id from achievements where code = 'chal_calorie'), '#FF5C8A'
on conflict (slug) do nothing;

-- A few sample routes (encoded polylines, precision 5).
insert into public.routes (name, type, distance_m, elevation_gain_m, map_polyline, region_lat, region_lng, region_label, times_completed) values
  ('Lakeside Loop',      'run',  5200,  24, 'o~|lAkz`uMcBaDaDiBkE?cDhBoBnDGlEnB`DdD~AjE?`DoB', 12.97, 77.59, 'Bengaluru', 1284),
  ('Ridge Climb',        'ride', 32400, 410, 'wn|lA_u`uM{QoTsPiSkVcNwYyBkUlEgPdQ', 12.97, 77.59, 'Bengaluru', 642),
  ('Park Stroll',        'walk', 2800,  6,  'k`}lAwf`uMwAyAyB_@aCh@gAvBGfCnAtBvBj@', 12.97, 77.59, 'Bengaluru', 2210),
  ('Sunrise Tempo',      'run',  10000, 58, 'cr|lAyk`uMyFgHoHiE_JcA}IvBaH~FkCfJfA`JnFtGzH`D', 12.97, 77.59, 'Bengaluru', 977)
on conflict do nothing;
