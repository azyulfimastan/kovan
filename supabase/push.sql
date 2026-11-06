-- Phone/desktop notifications: when someone changes a note, the other members of that room
-- get a push notification ("Room — Name: note title"). Run once in Supabase SQL Editor.
--
-- How it works: a trigger on notes puts a one-time job in push_jobs and calls /api/push with
-- only the job's random id. The function claims the job (once) and sends the notifications.
-- No shared secret is needed: the id is unguessable and can be used only once.

create extension if not exists pg_net;

create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.push_jobs (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create table if not exists public.push_log (
  note_id uuid not null,
  user_id uuid not null,
  at timestamptz not null default now(),
  primary key (note_id, user_id)
);
-- the app's own notification key pair; made once by /api/push on first use (no one types it in)
create table if not exists public.push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
-- no policies: only the functions below can read or write these tables
alter table public.push_keys enable row level security;
alter table public.push_subs enable row level security;
alter table public.push_jobs enable row level security;
alter table public.push_log enable row level security;

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text)
returns void language sql security definer set search_path = public as $$
  insert into push_subs (endpoint, user_id, p256dh, auth)
  select p_endpoint, auth.uid(), p_p256dh, p_auth where auth.uid() is not null
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
$$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subs where endpoint = p_endpoint and user_id = auth.uid();
$$;

create or replace function public.notes_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  subs jsonb;
  job uuid;
begin
  if actor is null or new.deleted_at is not null then return new; end if;
  if tg_op = 'UPDATE' and new.title is not distinct from old.title and new.body is not distinct from old.body then return new; end if;
  if coalesce(new.title, '') = '' and coalesce(new.body, '') = '' then return new; end if;
  -- at most one notification per note and writer every 10 minutes
  if exists (select 1 from push_log where note_id = new.id and user_id = actor and at > now() - interval '10 minutes') then
    return new;
  end if;
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into subs
  from push_subs s join members m on m.user_id = s.user_id
  where m.workspace_id = new.workspace_id and s.user_id <> actor;
  if subs is null then return new; end if;

  insert into push_log (note_id, user_id, at) values (new.id, actor, now())
  on conflict (note_id, user_id) do update set at = now();
  insert into push_jobs (payload) values (jsonb_build_object(
    'subs', subs,
    'title', (select name from workspaces where id = new.workspace_id),
    'actor', (select coalesce(nullif(name, ''), split_part(email, '@', 1)) from members where workspace_id = new.workspace_id and user_id = actor),
    'w', new.workspace_id,
    'n', new.id
  )) returning id into job;
  perform net.http_post(
    url := 'https://kovan-notes.vercel.app/api/push',
    body := jsonb_build_object('id', job),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 30000
  );
  delete from push_jobs where created_at < now() - interval '1 day';
  return new;
exception when others then
  return new; -- a notification problem must never stop a note from saving
end $$;

drop trigger if exists notes_push on public.notes;
create trigger notes_push after insert or update of title, body on public.notes
  for each row execute function public.notes_push();

create or replace function public.push_public_key() returns text
language sql stable security definer set search_path = public as $$
  select public_key from push_keys where id = 1;
$$;

create or replace function public.push_keys_init(p_public text, p_private text) returns void
language sql security definer set search_path = public as $$
  insert into push_keys (id, public_key, private_key) values (1, p_public, p_private) on conflict (id) do nothing;
$$;

-- called by /api/push: returns the job once, with the note's current title
create or replace function public.push_claim(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j push_jobs;
  n notes;
begin
  update push_jobs set claimed_at = now()
  where id = p_id and claimed_at is null and created_at > now() - interval '10 minutes'
  returning * into j;
  if j.id is null then return null; end if;
  select * into n from notes where id = (j.payload ->> 'n')::uuid;
  if n.id is null or n.deleted_at is not null then return null; end if;
  return j.payload || (select jsonb_build_object('vapid_public', public_key, 'vapid_private', private_key) from push_keys where id = 1)
    || jsonb_build_object('body',
    coalesce(j.payload ->> 'actor', '?') || ': ' ||
    coalesce(nullif(n.title, ''), left(regexp_replace(coalesce(n.body, ''), '[#*_>`\[\]!]|\(http[^)]*\)', '', 'g'), 80)));
end $$;

-- called by /api/push for subscriptions the browser vendor says no longer exist
create or replace function public.push_drop(p_id uuid, p_endpoints text[]) returns void
language sql security definer set search_path = public as $$
  delete from push_subs s
  where s.endpoint = any (p_endpoints)
    and exists (select 1 from push_jobs j where j.id = p_id
                and j.payload -> 'subs' @> jsonb_build_array(jsonb_build_object('endpoint', s.endpoint)));
$$;

revoke all on function public.push_subscribe(text, text, text) from public, anon;
revoke all on function public.push_unsubscribe(text) from public, anon;
grant execute on function public.push_subscribe(text, text, text) to authenticated;
grant execute on function public.push_unsubscribe(text) to authenticated;
revoke all on function public.notes_push() from public, anon, authenticated;
grant execute on function public.push_claim(uuid) to anon, authenticated;
grant execute on function public.push_public_key() to anon, authenticated;
grant execute on function public.push_keys_init(text, text) to anon;
grant execute on function public.push_drop(uuid, text[]) to anon, authenticated;
