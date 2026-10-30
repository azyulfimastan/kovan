-- Kovan database schema. Run this once in Supabase: SQL Editor -> New query -> Run.

-- Notebooks (shared workspaces) ------------------------------------------
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  email        text,
  name         text,
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title        text not null default '',
  body         text not null default '',
  tags         text[] not null default '{}',
  pinned       boolean not null default false,
  created_by   uuid default auth.uid(),
  updated_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists notes_ws_idx on public.notes (workspace_id, updated_at desc);

-- Helpers ------------------------------------------------------------------
create or replace function public.is_member(ws uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

-- The creator of a notebook automatically becomes a member.
create or replace function public.add_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.members (workspace_id, user_id, email, name)
  select new.id, new.owner_id, u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email)
  from auth.users u
  where u.id = new.owner_id
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists ws_add_owner on public.workspaces;
create trigger ws_add_owner after insert on public.workspaces
  for each row execute function public.add_owner_member();

-- Join a notebook with an invite code.
create or replace function public.join_workspace(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
  usr record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select w.id into ws from public.workspaces w where w.invite_code = code;
  if ws is null then
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

-- Owner can replace the invite link (old link stops working).
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
     set invite_code = new_code
   where id = ws and owner_id = auth.uid();
  if not found then
    raise exception 'not allowed';
  end if;
  return new_code;
end;
$$;

revoke all on function public.join_workspace(text) from public, anon;
revoke all on function public.rotate_invite(uuid) from public, anon;
grant execute on function public.join_workspace(text) to authenticated;
grant execute on function public.rotate_invite(uuid) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;

-- Row level security -----------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.members    enable row level security;
alter table public.notes      enable row level security;

drop policy if exists "workspaces select" on public.workspaces;
create policy "workspaces select" on public.workspaces
  for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id));

drop policy if exists "workspaces insert" on public.workspaces;
create policy "workspaces insert" on public.workspaces
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "workspaces update" on public.workspaces;
create policy "workspaces update" on public.workspaces
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "workspaces delete" on public.workspaces;
create policy "workspaces delete" on public.workspaces
  for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "members select" on public.members;
create policy "members select" on public.members
  for select to authenticated
  using (public.is_member(workspace_id));

drop policy if exists "members delete" on public.members;
create policy "members delete" on public.members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
  );

drop policy if exists "notes select" on public.notes;
create policy "notes select" on public.notes
  for select to authenticated
  using (public.is_member(workspace_id));

drop policy if exists "notes insert" on public.notes;
create policy "notes insert" on public.notes
  for insert to authenticated
  with check (public.is_member(workspace_id));

drop policy if exists "notes update" on public.notes;
create policy "notes update" on public.notes
  for update to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

drop policy if exists "notes delete" on public.notes;
create policy "notes delete" on public.notes
  for delete to authenticated
  using (public.is_member(workspace_id));

-- Realtime -------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null;
end $$;
-- Folders. Run once in Supabase: SQL Editor -> New query -> Run.
create table if not exists public.folders (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  created_at   timestamptz not null default now()
);

alter table public.notes
  add column if not exists folder_id uuid references public.folders(id) on delete set null;

create index if not exists folders_ws_idx on public.folders (workspace_id);

alter table public.folders enable row level security;

drop policy if exists "folders select" on public.folders;
create policy "folders select" on public.folders for select to authenticated
  using (public.is_member(workspace_id));
drop policy if exists "folders insert" on public.folders;
create policy "folders insert" on public.folders for insert to authenticated
  with check (public.is_member(workspace_id));
drop policy if exists "folders update" on public.folders;
create policy "folders update" on public.folders for update to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
drop policy if exists "folders delete" on public.folders;
create policy "folders delete" on public.folders for delete to authenticated
  using (public.is_member(workspace_id));

do $$
begin
  alter publication supabase_realtime add table public.folders;
exception when duplicate_object then null;
end $$;

-- Image attachments. Run once in Supabase: SQL Editor -> New query -> Run.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-images', 'note-images', true, 5242880, array['image/jpeg','image/png','image/gif','image/webp'])
on conflict (id) do nothing;

drop policy if exists "note images insert" on storage.objects;
create policy "note images insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'note-images' and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "note images delete" on storage.objects;
create policy "note images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'note-images' and public.is_member(((storage.foldername(name))[1])::uuid));
