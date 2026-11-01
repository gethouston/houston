-- data_referrals: companies referred to the Houston Data Partners program
-- from the /data-partners/refer form (website/src/assets/refer-send.js).
--
-- Same shape of access as public.waitlist: the public site may INSERT and
-- nothing else. It cannot read the table, and it can only write the columns
-- granted below, so `status` always starts at 'submitted' and only privileged
-- roles (service_role, postgres) move it through the referral's life.
--
-- No unique index on the company: "the first valid referral for a company
-- counts" is decided by the team from created_at, and a conflict answer would
-- tell a stranger that someone else already referred that company.
--
-- website/test/refer-send.test.mjs holds the granted columns to the row the
-- form sends, and the status values to the page's referral tracker.

create table if not exists public.data_referrals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'submitted'
    check (status in ('submitted', 'in_progress', 'reward_confirmed', 'paid', 'declined')),

  referrer_name text not null check (char_length(referrer_name) between 1 and 200),
  referrer_email text not null check (char_length(referrer_email) between 3 and 320),

  -- The open request the referral answers (a slug from the request board),
  -- null when the company is "not on the list".
  listing text check (char_length(listing) <= 100),
  company_name text not null check (char_length(company_name) between 1 and 200),
  -- The bare host ("acme.com"), already normalized by the form.
  company_website text not null check (char_length(company_website) between 3 and 253),
  -- The referrer's own words for the head count ("about 120", "200-500").
  company_size text not null check (char_length(company_size) between 1 and 60),
  years_in_business integer not null check (years_in_business between 0 and 300),

  locale text check (locale in ('en', 'es', 'pt')),
  page text check (char_length(page) <= 300)
);

create index if not exists data_referrals_created_at on public.data_referrals (created_at desc);
create index if not exists data_referrals_company_website on public.data_referrals (lower(company_website));

alter table public.data_referrals enable row level security;

drop policy if exists "anyone can refer a company" on public.data_referrals;
create policy "anyone can refer a company"
  on public.data_referrals
  for insert
  to anon, authenticated
  with check (status = 'submitted');

-- Public roles may INSERT these columns only: no select, update or delete,
-- and never id, created_at or status.
revoke all on public.data_referrals from anon, authenticated;
grant insert (
  referrer_name,
  referrer_email,
  listing,
  company_name,
  company_website,
  company_size,
  years_in_business,
  locale,
  page
) on public.data_referrals to anon, authenticated;
