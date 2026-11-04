-- Notes always record who really wrote them: created_by can't be faked or changed later,
-- updated_by is the signed-in user. (The storage quota counts notes by created_by.)
create or replace function public._notes_authorship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_by := old.created_by;
  end if;
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end $$;
create or replace trigger notes_authorship before insert or update on public.notes
  for each row execute function public._notes_authorship();
