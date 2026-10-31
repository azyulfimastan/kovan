-- Account deletion, admin delete and ban. Run once in the Supabase SQL editor.

create or replace function public._is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') in ('azyulfimastan@gmail.com', 'kulaahmet96@gmail.com')
$$;

-- Removes a user. Rooms they own that still have other members are handed to the longest-standing member;
-- rooms with nobody else are deleted (their notes go with them).
create or replace function public._purge_user(uid uuid) returns void
language plpgsql security definer set search_path = public, auth, storage as $$
declare w record; nxt uuid;
begin
  for w in select id from public.workspaces where owner_id = uid loop
    select m.user_id into nxt from public.members m where m.workspace_id = w.id and m.user_id <> uid order by m.joined_at limit 1;
    if nxt is not null then
      update public.workspaces set owner_id = nxt where id = w.id;
    else
      begin delete from storage.objects where bucket_id = 'note-images' and name like w.id::text || '/%'; exception when others then null; end;
    end if;
  end loop;
  delete from auth.users where id = uid;
end $$;
revoke all on function public._purge_user(uuid) from public, anon, authenticated;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform public._purge_user(auth.uid());
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public._is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if target = auth.uid() then raise exception 'cannot delete yourself here' using errcode = '22023'; end if;
  perform public._purge_user(target);
end $$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

create or replace function public.admin_set_ban(target uuid, ban boolean) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public._is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if target = auth.uid() then raise exception 'cannot ban yourself' using errcode = '22023'; end if;
  update auth.users set banned_until = case when ban then now() + interval '100 years' else null end where id = target;
end $$;
revoke all on function public.admin_set_ban(uuid, boolean) from public, anon;
grant execute on function public.admin_set_ban(uuid, boolean) to authenticated;

create or replace function public.admin_users()
returns table (user_id uuid, email text, created_at timestamptz, last_sign_in timestamptz, banned boolean, is_admin boolean)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public._is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query select u.id, u.email::text, u.created_at, u.last_sign_in_at,
    coalesce(u.banned_until > now(), false),
    u.email in ('azyulfimastan@gmail.com', 'kulaahmet96@gmail.com')
  from auth.users u;
end $$;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
