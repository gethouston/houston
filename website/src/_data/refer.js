// Structure only for the /data-partners/refer page. Text lives in
// _data/i18n/refer/* (surfaced as `t.refer`). Arrays here zip by index with
// the i18n arrays, the same contract _data/enterprise.js keeps.

import dataPartners from "./dataPartners.js";
import locales from "./locales.js";

// The program's terms. Retune them here; the copy reads the amount through
// the {amount} placeholder and the tests hold the rest of the copy to these.
// Every amount is the reference program's figure at the share Houston pays
// on /data-partners, so the two pages quote one program.
const pay = (referenceUsd) =>
  Math.round(referenceUsd * dataPartners.model.share);
const amountUsd = pay(100000);

const money = (lang, n) =>
  new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default {
  // The URL segment under every locale root ("/data-partners/refer/", ...).
  path: "data-partners/refer/",

  // There is no referral endpoint yet: the form composes an email to this
  // inbox (assets/refer-form.js), and the page says so.
  inbox: "hello@gethouston.ai",
  people: ["felipe", "julian"],

  pay,
  amountUsd,
  // A company qualifies at the /data-partners bar (the FAQ's 20 full-time
  // employees); a referral earns the full amount from fullAmountEmployees up
  // and a pro-rata share between the two.
  minEmployees: 20,
  fullAmountEmployees: 30,
  maxOpenReferrals: 5,
  // The amount, formatted per locale, for every {amount} in the copy.
  amountText: Object.fromEntries(
    locales.order.map((code) => [
      code,
      money(locales[code].htmlLang, amountUsd),
    ]),
  ),

  // Zips with t.refer.companies.items: the glyph each card wears
  // (refer/icons.njk).
  categories: [
    "software",
    "healthcare",
    "science",
    "industrial",
    "finance",
    "services",
    "media",
    "business",
  ],
  // Zips with t.refer.how.steps.
  steps: ["find", "refer", "work", "paid"],
  // Zips with t.refer.form.sizes: the value the email carries, the same in
  // every language.
  sizes: [
    "1-19",
    "20-49",
    "50-199",
    "200-499",
    "500-999",
    "1000-4999",
    "5000+",
  ],
  // Zips with t.refer.track.states.
  states: ["submitted", "in_progress", "bonus_confirmed", "paid"],
};
