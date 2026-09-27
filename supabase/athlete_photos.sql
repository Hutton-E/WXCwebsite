alter table public.athletes
  add column if not exists photo_url text;

grant update on table public.athletes to service_role;