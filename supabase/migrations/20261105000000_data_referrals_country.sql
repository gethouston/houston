-- data_referrals.company_country: the country the referred company is based
-- in, picked on the /data-partners/refer form. The English country name, the
-- same value the download form and public.data_partner_calls store. The form
-- requires it; rows from before this column have none, so it stays nullable.
--
-- Additive: the public site gets INSERT on this one new column, next to the
-- grants in 20261101000000_data_referrals.sql and
-- 20261102000000_data_referrals_industry.sql.

alter table public.data_referrals
  add column if not exists company_country text
    check (char_length(company_country) between 1 and 100);

grant insert (company_country) on public.data_referrals to anon, authenticated;
