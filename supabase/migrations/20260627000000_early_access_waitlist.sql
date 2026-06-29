-- Early-access / pledge capture on the waitlist (hardened)
-- Adds feedback fields + a secret per-row token, and two locked-down
-- security-definer functions so the public page can write ONLY its own
-- feedback to its own row. Anon never gets UPDATE/SELECT on waitlist.

-- 1) New nullable fields (non-breaking) + secret per-row token
alter table public.waitlist
  add column if not exists feedback_answer     text,
  add column if not exists pledged             boolean not null default false,
  add column if not exists pledged_at          timestamptz,
  add column if not exists responded_at        timestamptz,
  add column if not exists download_clicked_at timestamptz,
  add column if not exists download_os         text,
  add column if not exists response_token      uuid not null default gen_random_uuid();

-- Defense in depth: length cap on free text + os whitelist
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'waitlist_feedback_answer_len') then
    alter table public.waitlist
      add constraint waitlist_feedback_answer_len
      check (feedback_answer is null or char_length(feedback_answer) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'waitlist_download_os_chk') then
    alter table public.waitlist
      add constraint waitlist_download_os_chk
      check (download_os is null or download_os in ('mac','windows','other'));
  end if;
end $$;

-- Token lookups
create unique index if not exists waitlist_response_token_idx
  on public.waitlist (response_token);

-- 2) Locked-down write path: security-definer functions, token-scoped.
create or replace function public.submit_early_access(
  p_token   uuid,
  p_answer  text,
  p_pledged boolean
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.waitlist
     set feedback_answer = left(coalesce(p_answer, ''), 2000),
         pledged         = coalesce(p_pledged, false),
         pledged_at      = case when coalesce(p_pledged, false)
                                then coalesce(pledged_at, now()) else pledged_at end,
         responded_at    = coalesce(responded_at, now())
   where response_token = p_token
     and responded_at is null;   -- one-time; repeat submissions are ignored
  -- returns nothing whether or not a row matched (no enumeration oracle)
end;
$$;

create or replace function public.mark_download(
  p_token uuid,
  p_os    text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.waitlist
     set download_clicked_at = coalesce(download_clicked_at, now()),
         download_os = case when p_os in ('mac','windows','other')
                            then p_os else download_os end
   where response_token = p_token;
end;
$$;

-- 3) Grants: execute only to the web roles, never PUBLIC.
revoke execute on function public.submit_early_access(uuid, text, boolean) from public;
revoke execute on function public.mark_download(uuid, text)               from public;
grant  execute on function public.submit_early_access(uuid, text, boolean) to anon, authenticated;
grant  execute on function public.mark_download(uuid, text)               to anon, authenticated;

-- 4) Private read view (read via the service role only; never anon).
create or replace view public.early_access_overview
with (security_invoker = true) as
  select id, created_at, full_name, email, country,
         feedback_answer, pledged, pledged_at, responded_at,
         download_clicked_at, download_os,
         (converted_user_id is not null) as converted, converted_at,
         response_token
    from public.waitlist;
revoke all on public.early_access_overview from anon, authenticated;
