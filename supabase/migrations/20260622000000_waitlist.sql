-- waitlist: public marketing-site signups from the /waitlist page.
-- RLS allows INSERT only for anon/authenticated; nobody can read the list via
-- the public API (no SELECT policy). Privileged roles (service_role, postgres)
-- read it for outreach and analytics.
--
-- Conversion tracking: the waitlist_conversion view joins signups to profiles by
-- email so we can measure how many waitlisters became real accounts. Live
-- stamping of converted_at (via an auth trigger) is intentionally left out of v1
-- and can be added later as its own reviewed change.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  phone text not null,
  phone_country_code text,
  linkedin text not null,
  country text not null,
  source text not null default 'waitlist_page',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  user_agent text,
  converted_at timestamptz,
  converted_user_id uuid references auth.users on delete set null
);

-- dedupe by email (case-insensitive); the page treats a conflict as success
create unique index if not exists waitlist_email_unique on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

drop policy if exists "anyone can join the waitlist" on public.waitlist;
create policy "anyone can join the waitlist"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

-- public roles may INSERT only (no select/update/delete)
revoke all on public.waitlist from anon, authenticated;
grant insert on public.waitlist to anon, authenticated;

-- conversion view: match signups to real accounts by email
create or replace view public.waitlist_conversion as
select
  w.id,
  w.created_at as joined_at,
  w.full_name,
  w.email,
  w.country,
  w.source,
  (p.user_id is not null) as converted,
  p.created_at as account_created_at
from public.waitlist w
left join public.profiles p on lower(p.email) = lower(w.email);

-- keep the view private to privileged roles only
revoke all on public.waitlist_conversion from anon, authenticated;
