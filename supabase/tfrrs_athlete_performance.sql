create table if not exists public.tfrrs_athlete_performance (
  tfrrs_id text primary key,
  athlete_name text not null,
  photo_url text,
  race_history jsonb not null default '[]'::jsonb,
  personal_records jsonb not null default '{}'::jsonb,
  consistency_rating numeric,
  speed_rating numeric,
  endurance_rating numeric,
  win_factor_rating numeric,
  source_url text not null,
  last_imported_at timestamptz not null default now(),
  constraint tfrrs_athlete_performance_races_array
    check (jsonb_typeof(race_history) = 'array'),
  constraint tfrrs_athlete_performance_prs_object
    check (jsonb_typeof(personal_records) = 'object')
);

alter table public.tfrrs_athlete_performance enable row level security;

grant select on table public.tfrrs_athlete_performance to anon, authenticated;
grant select, insert, update on table public.tfrrs_athlete_performance to service_role;

drop policy if exists "Public can view TFRRS athlete performance"
  on public.tfrrs_athlete_performance;
create policy "Public can view TFRRS athlete performance"
  on public.tfrrs_athlete_performance for select
  to anon, authenticated
  using (true);