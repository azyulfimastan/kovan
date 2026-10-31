-- Admin overview: only the owner's e-mail can call it (checked on the server from the signed JWT).
create or replace function public.admin_overview()
returns table (
  user_id uuid, email text, created_at timestamptz, last_sign_in timestamptz,
  notes bigint, text_bytes bigint, image_bytes bigint
)
language plpgsql security definer set search_path = public, auth, storage as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'mastan96pl@gmail.com' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at,
    (select count(*) from public.notes n where n.created_by = u.id and n.deleted_at is null),
    (select coalesce(sum(octet_length(n.title) + octet_length(n.body)), 0)::bigint from public.notes n where n.created_by = u.id),
    (select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint from storage.objects o
       where o.bucket_id = 'note-images' and coalesce(to_jsonb(o) ->> 'owner_id', to_jsonb(o) ->> 'owner') = u.id::text)
  from auth.users u
  order by u.created_at desc;
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
