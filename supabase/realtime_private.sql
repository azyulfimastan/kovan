-- Private Realtime channels: only members of a room can join its live channels.
--   live:v2:<note id>   live co-editing of one note
--   presence:<room id>  who is online in a room
--   notes:<room id>     list updates of a room
-- After this, turn OFF "Allow public access" in Supabase -> Project Settings -> Realtime.
create or replace function public.can_use_topic(t text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p text[] := string_to_array(t, ':'); x uuid;
begin
  if array_length(p, 1) = 3 and p[1] = 'live' and p[2] = 'v2' then
    begin x := p[3]::uuid; exception when others then return false; end;
    return exists (select 1 from public.notes n where n.id = x and public.is_member(n.workspace_id));
  elsif array_length(p, 1) = 2 and p[1] in ('presence', 'notes') then
    begin x := p[2]::uuid; exception when others then return false; end;
    return public.is_member(x);
  end if;
  return false;
end $$;
revoke all on function public.can_use_topic(text) from public, anon;
grant execute on function public.can_use_topic(text) to authenticated;
create policy "kovan rooms read" on realtime.messages for select to authenticated using (public.can_use_topic((select realtime.topic())));
create policy "kovan rooms write" on realtime.messages for insert to authenticated with check (public.can_use_topic((select realtime.topic())));
