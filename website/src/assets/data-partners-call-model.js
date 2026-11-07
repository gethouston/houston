// The /data-partners "Book a call" form's rules. Pure: no DOM, so the page's
// popup (data-partners-call.js) and the tests run this one module.
//
// `validate` answers which fields are wrong; `callRow` turns a valid form into
// the public.data_partner_calls row (data-partners-call-send.js); `qualifies`
// decides whether the popup offers the calendar or only thanks the visitor.

import { LIMITS } from "./payout-model.js";
import { siteHost } from "./refer-model.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHOLE = /^\d{1,7}$/;
const DIAL = /^\+\d{1,6}$/;
// Digits a reachable number has once spaces, dashes and brackets are gone.
const MIN_PHONE_DIGITS = 5;
const MAX_PHONE_DIGITS = 15;
export const MAX_EMPLOYEES = 1000000;
export const MAX_YEARS = 300;

// The program's bar, the FAQ's "at least 20 full-time employees", which is
// also where the payout estimator starts.
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

// Returns { field: true } for every field that is wrong; empty when the form
// can be sent. `phoneCode` is the dial code picked beside the number.
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

/** A company at the program's bar is offered the calendar. */
export const qualifies = (employees) => Number(employees) >= MIN_EMPLOYEES;

// The row for a valid form, keyed by the columns the public site may write
// (supabase/migrations/*_data_partner_calls.sql).
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

// The calendar, opened with the visitor's name and email already filled in
// (Calendly reads both from the query string).
export function bookingUrl(base, { name, email }) {
  const url = new URL(base);
  url.searchParams.set("name", clean(name));
  url.searchParams.set("email", clean(email));
  return url.toString();
}
