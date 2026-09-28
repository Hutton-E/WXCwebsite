alter table public.tfrrs_athlete_performance
  add column if not exists indoor_consistency_rating numeric,
  add column if not exists outdoor_consistency_rating numeric;

grant update on table public.tfrrs_athlete_performance to service_role;