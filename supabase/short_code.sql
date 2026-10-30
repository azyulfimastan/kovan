-- 6-digit room codes. Run once in Supabase: SQL Editor -> New query -> Run.
create or replace function public.gen_short_code()
returns text language plpgsql as $$
declare c text;
begin
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.workspaces where short_code = c);
  end loop;
  return c;
end $$;

alter table public.workspaces add column if not exists short_code text;
update public.workspaces set short_code = public.gen_short_code() where short_code is null;
alter table public.workspaces alter column short_code set default public.gen_short_code();
alter table public.workspaces alter column short_code set not null;
create unique index if not exists workspaces_short_code_key on public.workspaces (short_code);

-- failed code guesses are counted so codes cannot be brute-forced
create table if not exists public.join_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
alter table public.join_attempts enable row level security;

create or replace function public.join_workspace(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
  usr record;
  is_short boolean := code ~ '^[0-9]{6}$';
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if is_short then
    delete from public.join_attempts where at < now() - interval '1 day';
    if (select count(*) from public.join_attempts where user_id = auth.uid() and at > now() - interval '10 minutes') >= 8 then
      raise exception 'too many attempts';
    end if;
  end if;

  select w.id into ws from public.workspaces w where w.invite_code = code or w.short_code = code;
  if ws is null then
    if is_short then
      insert into public.join_attempts (user_id) values (auth.uid());
      return null;
    end if;
    raise exception 'invalid invite';
  end if;

  select u.email as email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email) as name
    into usr
    from auth.users u
   where u.id = auth.uid();

  insert into public.members (workspace_id, user_id, email, name)
  values (ws, auth.uid(), usr.email, usr.name)
  on conflict do nothing;

  return ws;
end;
$$;

create or replace function public.rotate_invite(ws uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text := replace(gen_random_uuid()::text, '-', '');
begin
  update public.workspaces
     set invite_code = new_code, short_code = public.gen_short_code()
   where id = ws and owner_id = auth.uid();
  if not found then
    raise exception 'not allowed';
  end if;
  return new_code;
end;
$$;
