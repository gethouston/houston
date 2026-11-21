const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const YEARS = /^\d{1,3}$/;
export const MAX_YEARS = 300;
export const MAX_SIZE_LENGTH = 60;
export const MAX_COUNTRY_LENGTH = 100;
const PHONE = /^\+?[\d\s().-]+$/;
export const MIN_PHONE_DIGITS = 7;
export const MAX_PHONE_DIGITS = 15;
export const MAX_PHONE_LENGTH = 40;

export const FIELDS = [
  "yourName",
  "yourEmail",
  "yourPhone",
  "companyName",
  "website",
  "size",
  "years",
  "industry",
  "country",
  "listing",
];

const clean = (value) => (typeof value === "string" ? value.trim() : "");

export function siteHost(value) {
  const host = clean(value)
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
  return HOST.test(host) ? host : null;
}

const emailHost = (email) => email.split("@")[1]?.toLowerCase() ?? "";

export function validate(input) {
  const v = Object.fromEntries(FIELDS.map((k) => [k, clean(input[k])]));
  const errors = {};
  if (!v.yourName) errors.yourName = "yourName";
  if (!EMAIL.test(v.yourEmail)) errors.yourEmail = "yourEmail";
  const digits = v.yourPhone.replace(/\D/g, "").length;
  if (
    !PHONE.test(v.yourPhone) ||
    v.yourPhone.length > MAX_PHONE_LENGTH ||
    digits < MIN_PHONE_DIGITS ||
    digits > MAX_PHONE_DIGITS
  ) {
    errors.yourPhone = "yourPhone";
  }
  if (!v.companyName) errors.companyName = "companyName";
  const host = siteHost(v.website);
  if (!host) errors.website = "website";
  if (!v.size || v.size.length > MAX_SIZE_LENGTH) errors.size = "size";
  if (!YEARS.test(v.years) || Number(v.years) > MAX_YEARS) {
    errors.years = "years";
  }
  if (!v.industry) errors.industry = "industry";
  if (!v.country || v.country.length > MAX_COUNTRY_LENGTH) {
    errors.country = "country";
  }
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

export function referralRow(input, { locale, page }) {
  const v = Object.fromEntries(FIELDS.map((k) => [k, clean(input[k])]));
  return {
    referrer_name: v.yourName,
    referrer_email: v.yourEmail,
    referrer_phone: v.yourPhone,
    listing: v.listing || null,
    company_name: v.companyName,
    company_website: siteHost(v.website),
    company_size: v.size,
    years_in_business: Number(v.years),
    industry: v.industry,
    company_country: v.country,
    locale,
    page,
  };
}
