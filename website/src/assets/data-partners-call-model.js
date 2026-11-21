import { LIMITS } from "./payout-model.js";
import { siteHost } from "./refer-model.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHOLE = /^\d{1,7}$/;
const DIAL = /^\+\d{1,6}$/;
const MIN_PHONE_DIGITS = 5;
const MAX_PHONE_DIGITS = 15;
export const MAX_EMPLOYEES = 1000000;
export const MAX_YEARS = 300;

export const MIN_EMPLOYEES = LIMITS.employees.min;

export const FIELDS = [
  "name",
  "country",
  "phone",
  "email",
  "company",
  "website",
  "employees",
  "years",
];

const clean = (value) => (typeof value === "string" ? value.trim() : "");
const whole = (value, max) => WHOLE.test(value) && Number(value) <= max;
const phoneDigits = (value) => clean(value).replace(/\D/g, "");

export function validate(input) {
  const v = Object.fromEntries(FIELDS.map((k) => [k, clean(input[k])]));
  const errors = {};
  if (!v.name) errors.name = true;
  if (!v.country) errors.country = true;
  const digits = phoneDigits(v.phone).length;
  if (
    !DIAL.test(clean(input.phoneCode)) ||
    digits < MIN_PHONE_DIGITS ||
    digits > MAX_PHONE_DIGITS
  ) {
    errors.phone = true;
  }
  if (!EMAIL.test(v.email)) errors.email = true;
  if (!v.company) errors.company = true;
  if (!siteHost(v.website)) errors.website = true;
  if (!whole(v.employees, MAX_EMPLOYEES) || Number(v.employees) < 1) {
    errors.employees = true;
  }
  if (!whole(v.years, MAX_YEARS)) errors.years = true;
  return errors;
}

export const qualifies = (employees) => Number(employees) >= MIN_EMPLOYEES;

export function callRow(input, { locale, page, source }) {
  const v = Object.fromEntries(FIELDS.map((k) => [k, clean(input[k])]));
  const code = clean(input.phoneCode);
  return {
    full_name: v.name,
    country: v.country,
    phone: `${code} ${v.phone}`,
    phone_country_code: code,
    email: v.email,
    company_name: v.company,
    company_website: siteHost(v.website),
    employees: Number(v.employees),
    years_in_business: Number(v.years),
    source: source || null,
    locale,
    page,
  };
}

export function bookingUrl(base, { name, email }) {
  const url = new URL(base);
  url.searchParams.set("name", clean(name));
  url.searchParams.set("email", clean(email));
  return url.toString();
}
