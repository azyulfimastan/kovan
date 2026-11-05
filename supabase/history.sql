-- Note history: the text of a note is saved as a version before it changes,
-- at most once every 10 minutes of editing; the last 50 versions per note are kept.
create table if not exists public.note_versions (
  id bigserial primary key,
  note_id uuid not null references public.notes(id) on delete cascade,
  workspace_id uuid not null,
  title text not null default '',
  body text not null default '',
  saved_by uuid,
  saved_at timestamptz not null default now()
);
create index if not exists note_versions_note_idx on public.note_versions (note_id, saved_at desc);
alter table public.note_versions enable row level security;
create policy "versions select" on public.note_versions for select to authenticated using (public.is_member(workspace_id));

create or replace function public._note_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.title is distinct from old.title or new.body is distinct from old.body)
     and (old.title <> '' or old.body <> '')
     and not exists (select 1 from public.note_versions v where v.note_id = old.id and v.saved_at > now() - interval '10 minutes') then
    insert into public.note_versions (note_id, workspace_id, title, body, saved_by)
    values (old.id, old.workspace_id, old.title, old.body, old.updated_by);
    delete from public.note_versions where id in (
      select v.id from public.note_versions v where v.note_id = old.id order by v.saved_at desc offset 50);
  end if;
  return new;
end $$;
create or replace trigger notes_version before update on public.notes for each row execute function public._note_version();

-- save the current text as a version right now (used before restoring an older one, so it can be undone)
create or replace function public.snapshot_note(nid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n record;
begin
  select * into n from public.notes where id = nid;
  if not found or not public.is_member(n.workspace_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.note_versions (note_id, workspace_id, title, body, saved_by) values (n.id, n.workspace_id, n.title, n.body, auth.uid());
end $$;
revoke all on function public.snapshot_note(uuid) from public, anon;
grant execute on function public.snapshot_note(uuid) to authenticated;
