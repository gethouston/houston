-- Country capture on profiles.
--
-- We can't report users by country today: Google OAuth returns no
-- location, and `handle_new_user` (the trigger that creates the row)
-- runs inside Postgres and never sees the request IP. So country is
-- stamped after sign-in by the houston-relay Cloudflare Worker, which
-- reads `request.cf.country` server-side (tamper-proof) and PATCHes
-- the row with the service role. See houston-relay/src/index.ts
-- (POST /capture-country).
--
-- Additive + nullable: backward-compatible, no backfill (no historical
-- IPs exist — auth.audit_log_entries is purged). Country is captured
-- from launch forward only.
--
-- No RLS policy is added for these columns on purpose: clients must NOT
-- be able to write `signup_country` themselves, or the value becomes
-- spoofable. The Worker writes with the service role, which bypasses RLS.

alter table public.profiles
  add column if not exists signup_country text,
  add column if not exists country_source text;

comment on column public.profiles.signup_country is
  'ISO 3166-1 alpha-2 country derived from request.cf.country at first sign-in. Null = unknown/unresolved.';
comment on column public.profiles.country_source is
  'Provenance of signup_country: cf_worker | manual.';
