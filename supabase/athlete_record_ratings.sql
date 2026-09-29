alter table public.tfrrs_athlete_performance
  add column if not exists cross_country_rating numeric,
  add column if not exists indoor_rating numeric,
  add column if not exists outdoor_rating numeric,
  add column if not exists speed_rating numeric,
  add column if not exists endurance_rating numeric,
  add column if not exists win_factor_rating numeric,
  add column if not exists runner_type text,
  add column if not exists runner_type_scores jsonb;

grant select, insert, update on table public.tfrrs_athlete_performance to service_role;
