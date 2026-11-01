-- Per-account storage quota (300 MB = photos + note text). Admins are exempt.
create or replace function public.my_usage() returns bigint language sql stable security definer set search_path = public, storage as $$
  select (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o where o.bucket_id = 'note-images' and coalesce(to_jsonb(o) ->> 'owner_id', to_jsonb(o) ->> 'owner') = auth.uid()::text)
       + (select coalesce(sum(octet_length(n.title) + octet_length(n.body)), 0) from public.notes n where n.created_by = auth.uid())
$$;
create or replace function public.quota_ok() returns boolean language sql stable security definer set search_path = public, storage as $$
  select public._is_admin() or public.my_usage() < 314572800
$$;
revoke all on function public.my_usage() from public, anon; grant execute on function public.my_usage() to authenticated;
revoke all on function public.quota_ok() from public, anon; grant execute on function public.quota_ok() to authenticated;
alter policy "note images insert" on storage.objects with check (bucket_id = 'note-images' and public.is_member(((storage.foldername(name))[1])::uuid) and public.quota_ok());
alter policy "notes insert" on public.notes with check (public.is_member(workspace_id) and public.quota_ok());
