-- data_referrals.industry: the company's industry, picked on the
-- /data-partners/refer form (an id from website/src/_data/refer.js
-- categories, e.g. 'finance'). The form requires it; rows from before this
-- column have none, so it stays nullable.
--
-- Additive: the public site gets INSERT on this one new column, next to the
-- grant in 20261101000000_data_referrals.sql.

alter table public.data_referrals
  add column if not exists industry text check (char_length(industry) <= 100);

grant insert (industry) on public.data_referrals to anon, authenticated;
