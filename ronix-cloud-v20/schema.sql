-- RONIX V20: run in the Supabase SQL editor. Re-running preserves all existing records.
begin;
create schema if not exists ronix_private;
revoke all on schema ronix_private from public, anon, authenticated;
create table if not exists ronix_private.allowed_emails (
  email text primary key check (email = lower(email))
);
revoke all on ronix_private.allowed_emails from public, anon, authenticated;

create or replace function public.ronix_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from ronix_private.allowed_emails
    where email = lower(auth.jwt()->>'email')
  );
$$;
revoke all on function public.ronix_allowed() from public, anon;
grant execute on function public.ronix_allowed() to authenticated;

create table if not exists public.ronix_ledger (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.ronix_ledger enable row level security;
drop policy if exists ronix_read_own on public.ronix_ledger;
create policy ronix_read_own on public.ronix_ledger for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.ronix_allowed()));
revoke all on public.ronix_ledger from public, anon, authenticated;
grant select on public.ronix_ledger to authenticated;

create table if not exists ronix_private.mutations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  revision bigint not null,
  primary key (owner_id, mutation_id)
);
revoke all on ronix_private.mutations from public, anon, authenticated;

create or replace function public.ronix_load() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare row_data public.ronix_ledger;
begin
  if not public.ronix_allowed() then raise exception 'RONIX_ACCESS_DENIED' using errcode='42501'; end if;
  select * into row_data from public.ronix_ledger where owner_id=auth.uid();
  if not found then return jsonb_build_object('revision',0,'payload',null); end if;
  return jsonb_build_object('revision',row_data.revision,'payload',row_data.payload,'updated_at',row_data.updated_at);
end;
$$;
create or replace function public.ronix_head() returns bigint
language plpgsql security definer set search_path = '' as $$
declare current_revision bigint;
begin
  if not public.ronix_allowed() then raise exception 'RONIX_ACCESS_DENIED' using errcode='42501'; end if;
  select revision into current_revision from public.ronix_ledger where owner_id=auth.uid();
  return coalesce(current_revision,0);
end;
$$;

create or replace function public.ronix_commit(expected_revision bigint, mutation_id uuid, next_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision bigint; prior_revision bigint; new_revision bigint; uid uuid:=auth.uid();
begin
  if not public.ronix_allowed() then raise exception 'RONIX_ACCESS_DENIED' using errcode='42501'; end if;
  if expected_revision is null or expected_revision < 0 or mutation_id is null or next_payload is null
     or jsonb_typeof(next_payload) <> 'object' then raise exception 'RONIX_INVALID_REQUEST'; end if;
  if jsonb_typeof(next_payload->'projects') is distinct from 'array'
     or jsonb_typeof(next_payload->'assignments') is distinct from 'array'
     or jsonb_typeof(next_payload->'payments') is distinct from 'array'
     or (next_payload->>'currency') is distinct from 'EGP'
     or coalesce((next_payload->>'schemaVersion')::integer,0) <> 19
     or octet_length(next_payload::text)>20000000 then raise exception 'RONIX_INVALID_DATA'; end if;
  -- Serializes creation as well as updates of this owner's ledger.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select m.revision into prior_revision from ronix_private.mutations m
    where m.owner_id=uid and m.mutation_id=ronix_commit.mutation_id;
  if found then return jsonb_build_object('status','saved','revision',prior_revision,'replayed',true); end if;
  select revision into current_revision from public.ronix_ledger where owner_id=uid;
  current_revision:=coalesce(current_revision,0);
  if current_revision<>expected_revision then
    return jsonb_build_object('status','conflict','revision',current_revision);
  end if;
  new_revision:=current_revision+1;
  insert into public.ronix_ledger(owner_id,revision,payload) values(uid,new_revision,next_payload)
    on conflict(owner_id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=now();
  insert into ronix_private.mutations values(uid,mutation_id,new_revision);
  return jsonb_build_object('status','saved','revision',new_revision,'replayed',false);
end;
$$;
revoke all on function public.ronix_load(), public.ronix_head(), public.ronix_commit(bigint,uuid,jsonb) from public, anon;
grant execute on function public.ronix_load(), public.ronix_head(), public.ronix_commit(bigint,uuid,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('ronix-files','ronix-files',false,5242880,array['image/png','image/jpeg','image/webp','application/pdf'])
  on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists ronix_files_read on storage.objects;
drop policy if exists ronix_files_insert on storage.objects;
create policy ronix_files_read on storage.objects for select to authenticated
  using(bucket_id='ronix-files' and (storage.foldername(name))[1]=(select auth.uid())::text and (select public.ronix_allowed()));
create policy ronix_files_insert on storage.objects for insert to authenticated
  with check(bucket_id='ronix-files' and (storage.foldername(name))[1]=(select auth.uid())::text and (select public.ronix_allowed()));
-- No update/delete policy: hashes are immutable, so old evidence and recovery snapshots keep working.
-- The setup page appends the single authorized email below, on your own computer.
commit;
