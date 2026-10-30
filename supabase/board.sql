-- Board (Trello-style). Run once in Supabase: SQL Editor -> New query -> Run.
create table if not exists public.board_columns (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  pos          double precision not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists board_columns_ws_idx on public.board_columns (workspace_id);

alter table public.notes add column if not exists column_id uuid references public.board_columns(id) on delete set null;
alter table public.notes add column if not exists pos double precision not null default 0;
alter table public.notes add column if not exists due date;
alter table public.notes add column if not exists label text;
alter table public.notes add column if not exists assignee uuid;

alter table public.board_columns enable row level security;
drop policy if exists "columns select" on public.board_columns;
create policy "columns select" on public.board_columns for select to authenticated using (public.is_member(workspace_id));
drop policy if exists "columns insert" on public.board_columns;
create policy "columns insert" on public.board_columns for insert to authenticated with check (public.is_member(workspace_id));
drop policy if exists "columns update" on public.board_columns;
create policy "columns update" on public.board_columns for update to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
drop policy if exists "columns delete" on public.board_columns;
create policy "columns delete" on public.board_columns for delete to authenticated using (public.is_member(workspace_id));

do $$
begin
  alter publication supabase_realtime add table public.board_columns;
exception when duplicate_object then null;
end $$;
