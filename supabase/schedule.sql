create table if not exists public.cross_country_meets (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  gender text not null check (gender in ('men', 'women')),
  meet_name text not null,
  meet_date date not null,
  meet_time text,
  location text,
  result_summary text,
  status text not null default 'scheduled',
  meet_url text,
  recap_url text,
  schedule_url text not null,
  imported_at timestamptz not null default now(),
  unique (season, gender, meet_date, meet_name)
);

alter table public.athletes
  add column if not exists graduation_year integer;

create index if not exists cross_country_meets_season_gender_date_idx
  on public.cross_country_meets (season, gender, meet_date);

create table if not exists public.cross_country_results (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid not null references public.cross_country_meets(id) on delete cascade,
  athlete_id uuid not null,
  season integer not null,
  place text,
  time text,
  result_url text,
  imported_at timestamptz not null default now(),
  unique (meet_id, athlete_id, season),
  foreign key (athlete_id, season)
    references public.athletes(id, season)
    on delete cascade
);

create index if not exists cross_country_results_athlete_idx
  on public.cross_country_results (athlete_id);

alter table public.cross_country_meets enable row level security;
alter table public.cross_country_results enable row level security;

drop policy if exists "Public can view cross country meets"
  on public.cross_country_meets;
create policy "Public can view cross country meets"
  on public.cross_country_meets for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated admins can manage cross country meets"
  on public.cross_country_meets;
create policy "Authenticated admins can manage cross country meets"
  on public.cross_country_meets for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Public can view cross country results"
  on public.cross_country_results;
create policy "Public can view cross country results"
  on public.cross_country_results for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated admins can manage cross country results"
  on public.cross_country_results;
create policy "Authenticated admins can manage cross country results"
  on public.cross_country_results for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.time_trial_results (
  id uuid primary key default gen_random_uuid(),
  athlete_id text,
  season integer not null,
  trial_name text not null,
  result_time text not null,
  year_label text not null,
  athlete_name text not null,
  position integer,
  source_block integer not null default 1,
  details jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (athlete_id, season, trial_name, result_time, year_label),
  foreign key (athlete_id, season)
    references public.athletes(id, season)
    on delete cascade
);

alter table public.time_trial_results
  alter column athlete_id drop not null;

alter table public.time_trial_results
  add column if not exists athlete_name text,
  add column if not exists position integer,
  add column if not exists source_block integer not null default 1,
  add column if not exists details jsonb not null default '{}'::jsonb;

create index if not exists time_trial_results_athlete_idx
  on public.time_trial_results (athlete_id, season);

grant select on public.time_trial_results to anon, authenticated;

alter table public.time_trial_results enable row level security;

drop policy if exists "Public can view time trial results"
  on public.time_trial_results;
create policy "Public can view time trial results"
  on public.time_trial_results for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated admins can manage time trial results"
  on public.time_trial_results;
create policy "Authenticated admins can manage time trial results"
  on public.time_trial_results for all
  to authenticated
  using (true)
  with check (true);
