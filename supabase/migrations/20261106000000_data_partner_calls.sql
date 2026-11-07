-- data_partner_calls: companies asking for a call about the Houston Data
-- Partners program, from the "Book a call" form on /data-partners
-- (website/src/assets/data-partners-call.js).
--
-- Same shape of access as public.data_referrals: the public site may INSERT
-- the columns granted below and nothing else. It cannot read the table, so
-- a stranger never learns who else asked.
--
-- The form offers the calendar only to a company at the program's bar (the
-- FAQ's 20 full-time employees); everyone else is thanked and stored here
-- for the team to review. Which one happened follows from `employees`.
--
-- website/test/data-partners-call.test.mjs holds the granted columns to the
-- row the form sends.

create table if not exists public.data_partner_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  full_name text not null check (char_length(full_name) between 1 and 200),
  -- The English country name, the same value the download form stores.
  country text not null check (char_length(country) between 1 and 100),
  -- The whole number as dialled ("+57 300 123 4567"), and its country code.
  phone text not null check (char_length(phone) between 5 and 40),
  phone_country_code text not null check (char_length(phone_country_code) between 2 and 8),
  email text not null check (char_length(email) between 3 and 320),

  company_name text not null check (char_length(company_name) between 1 and 200),
  -- The bare host ("acme.com"), already normalized by the form.
  company_website text not null check (char_length(company_website) between 3 and 253),
  employees integer not null check (employees between 1 and 1000000),
  years_in_business integer not null check (years_in_business between 0 and 300),

  -- Which button opened the form: nav, menu, hero, estimate or contact.
  source text check (char_length(source) <= 40),
  locale text check (locale in ('en', 'es', 'pt')),
  page text check (char_length(page) <= 300)
);

create index if not exists data_partner_calls_created_at on public.data_partner_calls (created_at desc);

alter table public.data_partner_calls enable row level security;

drop policy if exists "anyone can ask for a call" on public.data_partner_calls;
create policy "anyone can ask for a call"
  on public.data_partner_calls
  for insert
  to anon, authenticated
  with check (true);

-- Public roles may INSERT these columns only: no select, update or delete,
-- and never id or created_at.
revoke all on public.data_partner_calls from anon, authenticated;
grant insert (
  full_name,
  country,
  phone,
  phone_country_code,
  email,
  company_name,
  company_website,
  employees,
  years_in_business,
  source,
  locale,
  page
) on public.data_partner_calls to anon, authenticated;
