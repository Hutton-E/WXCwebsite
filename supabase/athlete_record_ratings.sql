alter table public.tfrrs_athlete_performance
  add column if not exists cross_country_rating numeric,
  add column if not exists indoor_rating numeric,
  add column if not exists outdoor_rating numeric,
  add column if not exists speed_rating numeric,
  add column if not exists endurance_rating numeric;

grant update on table public.tfrrs_athlete_performance to service_role;
