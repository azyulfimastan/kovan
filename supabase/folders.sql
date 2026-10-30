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
