-- Accounts: profiles, saved paths, day-14 check-ins.
--
-- Access model: the backend writes with the service-role key (bypasses RLS).
-- Browsers hold only the anon key + the user's JWT; for them RLS allows
-- reading their own rows and nothing else — no client-side insert, update or
-- delete on any table. Rows go with the auth user (on delete cascade), which
-- is what "Delete my data" relies on.

-- One row per auth user, created by trigger at sign-up. Consent and age-gate
-- columns are filled by the consent step (T6); last_active_at drives the
-- 12-month inactivity purge (T13).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  birth_year smallint check (birth_year between 1900 and 2100),
  consent_version text,
  consented_at timestamptz,
  cohort text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

-- The accepted path, copied from the live session on accept and updated when
-- its roadmap is built. One row per assessment session (upsert key).
create table public.saved_paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null unique,
  output_id text not null,
  title text,
  soc_code text,
  output jsonb not null,
  roadmap jsonb,
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_paths_user_id_idx on public.saved_paths (user_id, accepted_at desc);

-- One answer per roadmap step of a saved path (done / planned / not yet).
-- user_id is denormalized so RLS needs no join.
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  saved_path_id uuid not null references public.saved_paths (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  step_id text not null,
  answer text not null check (answer in ('done', 'planned', 'no')),
  answered_at timestamptz not null default now(),
  unique (saved_path_id, step_id)
);
create index checkins_user_id_idx on public.checkins (user_id);

create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger saved_paths_touch_updated_at
  before update on public.saved_paths
  for each row execute function public.touch_updated_at();

-- security definer: runs as the owner so the auth schema's insert can create
-- the public row. Empty search_path + qualified names (Supabase linter rule).
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.saved_paths enable row level security;
alter table public.checkins enable row level security;

-- Read-own only. (select auth.uid()) is evaluated once per query, not per row.
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "saved_paths: read own" on public.saved_paths
  for select to authenticated using (user_id = (select auth.uid()));
create policy "checkins: read own" on public.checkins
  for select to authenticated using (user_id = (select auth.uid()));

-- Belt and braces: the anon role (signed-out browser) gets no table access at
-- all, and authenticated gets SELECT only, whatever the project defaults grant.
revoke all on public.profiles, public.saved_paths, public.checkins from anon, authenticated;
grant select on public.profiles, public.saved_paths, public.checkins to authenticated;

-- Trigger helpers are not an API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
