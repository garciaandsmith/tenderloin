-- Migration 001: fix project creation by ensuring the first registered user is admin.
--
-- Root cause: handle_new_user() always inserts with the default role 'user'.
-- Project creation requires role = 'admin', so no one could ever create a project
-- through the app without manually editing the database.
--
-- Two changes:
--   1. Update the trigger function so the *first* sign-up gets role 'admin'.
--   2. Back-fill: if the database already has users but no admins yet, promote
--      the earliest registered user to 'admin'.

-- 1. Update trigger ─────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
begin
  select case when count(*) = 0 then 'admin' else 'user' end
    into v_role
    from public.profiles;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, v_role);
  return new;
end;
$$;

-- 2. Back-fill existing installations ─────────────────────────────────────
-- If there are already users but none is admin, promote the first one.
update public.profiles
set    role = 'admin'
where  id = (select id from public.profiles order by created_at asc limit 1)
  and  not exists (select 1 from public.profiles where role = 'admin');
