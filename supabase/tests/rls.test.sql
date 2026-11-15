-- RLS proof for 20261115000000_accounts.sql. Runs after the stub + migration;
-- any failed expectation raises and stops psql (ON_ERROR_STOP).
\set ON_ERROR_STOP 1

-- Fixtures as the owner: two users (the trigger must create their profiles),
-- one saved path and one check-in each.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@example.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@example.test');

do $$
begin
  if (select count(*) from public.profiles) <> 2 then
    raise exception 'sign-up trigger did not create both profiles';
  end if;
end $$;

insert into public.saved_paths (id, user_id, session_id, output_id, title, output) values
  ('a0000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001',
   gen_random_uuid(), 'output_1', 'Hydrologist', '{}'),
  ('b0000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000002',
   gen_random_uuid(), 'output_1', 'Archivist', '{}');
insert into public.checkins (saved_path_id, user_id, step_id, answer) values
  ('a0000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'step_1', 'done'),
  ('b0000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000002', 'step_1', 'planned');

-- The service role (the backend) sees everything.
set role service_role;
do $$
begin
  if (select count(*) from public.saved_paths) <> 2 then
    raise exception 'service_role must see all saved paths';
  end if;
end $$;
reset role;

-- User A sees exactly their own rows in every table.
set role authenticated;
set request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.profiles) <> 1
     or (select id from public.profiles) <> 'aaaaaaaa-0000-4000-8000-000000000001' then
    raise exception 'A must see only their own profile';
  end if;
  if (select count(*) from public.saved_paths) <> 1
     or (select title from public.saved_paths) <> 'Hydrologist' then
    raise exception 'A must see only their own saved path';
  end if;
  if (select count(*) from public.checkins) <> 1 then
    raise exception 'A must see only their own check-in';
  end if;
  if exists (select 1 from public.saved_paths where user_id = 'bbbbbbbb-0000-4000-8000-000000000002') then
    raise exception 'A can read B''s saved path';
  end if;
end $$;

-- ...and can write nothing, not even their own rows.
do $$
begin
  begin
    insert into public.saved_paths (user_id, session_id, output_id, output)
      values ('aaaaaaaa-0000-4000-8000-000000000001', gen_random_uuid(), 'x', '{}');
    raise exception 'authenticated insert on saved_paths succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set cohort = 'forged';
    raise exception 'authenticated update on profiles succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.checkins;
    raise exception 'authenticated delete on checkins succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.checkins (saved_path_id, user_id, step_id, answer)
      values ('a0000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'step_2', 'done');
    raise exception 'authenticated insert on checkins succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A token with no subject sees nothing.
set request.jwt.claims = '{"role":"authenticated"}';
do $$
begin
  if (select count(*) from public.saved_paths) <> 0 then
    raise exception 'a subject-less token must see no rows';
  end if;
end $$;
reset role;

-- The anon role has no table access at all.
set role anon;
do $$
begin
  begin
    perform 1 from public.saved_paths;
    raise exception 'anon can select saved_paths';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.profiles;
    raise exception 'anon can select profiles';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Deleting the auth user takes every row with it ("Delete my data").
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001')
     or exists (select 1 from public.saved_paths where user_id = 'aaaaaaaa-0000-4000-8000-000000000001')
     or exists (select 1 from public.checkins where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') then
    raise exception 'user delete did not cascade';
  end if;
end $$;

\echo 'RLS: all checks passed'
