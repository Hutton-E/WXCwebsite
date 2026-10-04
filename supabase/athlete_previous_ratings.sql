alter table public.tfrrs_athlete_performance
  add column if not exists previous_ratings jsonb;
