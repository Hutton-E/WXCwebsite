alter table public.tfrrs_athlete_performance
  add column if not exists overall_rating numeric;

grant select, insert, update on table public.tfrrs_athlete_performance to service_role;
