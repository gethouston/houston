// The /data-partners/refer form's rules. Pure: no DOM, so the page's form
// (refer-form.js) and the tests run this one module.
//
// `validate` answers which fields are wrong, as keys into the copy's
// `form.errors`; `referralRow` turns a valid referral into the
// public.data_referrals row the form stores (refer-send.js).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
// Whole years, as typed: "12", not "12.5" or "about 12".
const YEARS = /^\d{1,3}$/;
export const MAX_YEARS = 300;
// Company size is the referrer's own words ("about 120", "200-500").
export const MAX_SIZE_LENGTH = 60;

export const FIELDS = [
  "yourName",
  "yourEmail",
  "listing",
  "companyName",
  "website",
  "size",
  "years",
];

const clean = (value) => (typeof value === "string" ? value.trim() : "");

// "https://www.Acme.com/about" -> "acme.com". Null when it is not a host.
export function siteHost(value) {
  const host = clean(value)
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
  return HOST.test(host) ? host : null;
}

const emailHost = (email) => email.split("@")[1]?.toLowerCase() ?? "";

// Returns { field: errorKey } for every field that is wrong; empty when the
// referral can be sent.
export function validate(input) {
  const v = Object.fromEntries(FIELDS.map((k) => [k, clean(input[k])]));
  const errors = {};
  if (!v.yourName) errors.yourName = "yourName";
  if (!EMAIL.test(v.yourEmail)) errors.yourEmail = "yourEmail";
  if (!v.companyName) errors.companyName = "companyName";
  const host = siteHost(v.website);
  if (!host) errors.website = "website";
  if (!v.size || v.size.length > MAX_SIZE_LENGTH) errors.size = "size";
  if (!YEARS.test(v.years) || Number(v.years) > MAX_YEARS) {
    errors.years = "years";
  }
  // Your own company is a partner, not a referral. Caught when your email
  // sits on the company's own domain.
  const mine = emailHost(v.yourEmail);
  if (
    host &&
    !errors.yourEmail &&
    (mine === host || mine.endsWith(`.${host}`))
  ) {
    errors.website = "sameCompany";
  }
  return errors;
}

// The row for a valid referral, keyed by the columns the public site may
// write (supabase/migrations/*_data_referrals.sql). Empty optionals are null.
export function referralRow(input, { locale, page }) {
  const v = Object.fromEntries(FIELDS.map((k) => [k, clean(input[k])]));
  return {
    referrer_name: v.yourName,
    referrer_email: v.yourEmail,
    listing: v.listing || null,
    company_name: v.companyName,
    company_website: siteHost(v.website),
    company_size: v.size,
    years_in_business: Number(v.years),
    locale,
    page,
  };
}
