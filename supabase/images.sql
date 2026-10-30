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
