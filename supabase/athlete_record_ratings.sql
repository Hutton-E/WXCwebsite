alter table public.tfrrs_athlete_performance
  drop column if exists consistency_rating,
  drop column if exists indoor_consistency_rating,
  drop column if exists outdoor_consistency_rating,
  drop column if exists cross_country_consistency_rating,
  add column if not exists cross_country_rating numeric,
  add column if not exists indoor_rating numeric,
  add column if not exists outdoor_rating numeric;

grant update on table public.tfrrs_athlete_performance to service_role;
