-- data_referrals.referrer_phone: the best number to reach the person who
-- sent the referral, typed on the /data-partners/refer form with its country
-- code ("+57 300 123 4567"). The form requires it; rows from before this
-- column have none, so it stays nullable.
--
-- Additive: the public site gets INSERT on this one new column, next to the
-- grants in the earlier *_data_referrals*.sql migrations.

alter table public.data_referrals
  add column if not exists referrer_phone text
    check (char_length(referrer_phone) between 7 and 40);

grant insert (referrer_phone) on public.data_referrals to anon, authenticated;
