// The /data-partners/refer form's rules. Pure: no DOM, so the page's form
// (refer-form.js) and the tests run this one module.
//
// `validate` answers which fields are wrong, as keys into the copy's
// `form.errors`; `referralRow` turns a valid referral into the
// public.data_referrals row the form stores (refer-send.js); `composeMail`
// turns it into the email the program inbox receives when storing fails.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const LINKEDIN =
  /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[^\s/?#]+\/?(?:[?#]\S*)?$/i;

export const FIELDS = [
  "yourName",
  "yourEmail",
  "listing",
  "companyName",
  "website",
  "size",
  "contactName",
  "contactEmail",
  "contactLinkedin",
  "fit",
];
// Checkboxes: read as booleans, not text, and never part of the email.
export const CHECKS = ["consent"];

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
// referral can be sent. `sizes` are the select's allowed values.
export function validate(input, sizes) {
  const v = Object.fromEntries(FIELDS.map((k) => [k, clean(input[k])]));
  const errors = {};
  if (!v.yourName) errors.yourName = "yourName";
  if (!EMAIL.test(v.yourEmail)) errors.yourEmail = "yourEmail";
  if (!v.companyName) errors.companyName = "companyName";
  const host = siteHost(v.website);
  if (!host) errors.website = "website";
  if (!sizes.includes(v.size)) errors.size = "size";
  if (!v.contactName) errors.contactName = "contactName";
  if (!EMAIL.test(v.contactEmail)) errors.contactEmail = "contactEmail";
  if (v.contactLinkedin && !LINKEDIN.test(v.contactLinkedin)) {
    errors.contactLinkedin = "contactLinkedin";
  }
  if (input.consent !== true) errors.consent = "consent";
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
    contact_name: v.contactName,
    contact_email: v.contactEmail,
    contact_linkedin: v.contactLinkedin || null,
    fit: v.fit || null,
    contact_consent: input.consent === true,
    locale,
    page,
  };
}

// The email for a valid referral: a subject naming the company and one
// "Label: value" line per filled field, labels in the referrer's language.
export function composeMail(input, copy) {
  const v = Object.fromEntries(FIELDS.map((k) => [k, clean(input[k])]));
  const lines = [`${copy.mail.referrer}: ${v.yourName} <${v.yourEmail}>`, ""];
  for (const key of FIELDS.slice(2)) {
    if (!v[key]) continue;
    const value =
      key === "website"
        ? siteHost(v.website)
        : key === "listing"
          ? (copy.listings?.[v.listing] ?? v.listing)
          : v[key];
    lines.push(`${copy.labels[key]}: ${value}`);
  }
  const subject = copy.mail.subject.replace("{company}", v.companyName);
  const body = lines.join("\n");
  const href = `mailto:${copy.inbox}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { subject, body, href };
}
