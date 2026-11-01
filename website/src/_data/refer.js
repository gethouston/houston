// Structure only for the /data-partners/refer page. Text lives in
// _data/i18n/refer/* (surfaced as `t.refer`). Arrays here zip by index with
// the i18n arrays, the same contract _data/enterprise.js keeps.

import { REQUESTS } from "../../lib/refer-requests.js";
import dataPartners from "./dataPartners.js";
import locales from "./locales.js";

// The program's terms. Retune them here; the copy reads the amount through
// the {amount} placeholder and the tests hold the rest of the copy to these.
// Every amount is the reference program's figure at the share Houston pays
// on /data-partners, so the two pages quote one program.
const pay = (referenceUsd) =>
  Math.round(referenceUsd * dataPartners.model.share);
// The headline "up to" figure: this share of the most any open request pays
// the company.
const headlineShare = 0.1;
const topDealUsd = Math.max(...REQUESTS.map((r) => pay(r.dealMaxUsd)));
const amountUsd = Math.round(topDealUsd * headlineShare);

const money = (lang, n) =>
  new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default {
  // The URL segment under every locale root ("/data-partners/refer/", ...).
  path: "data-partners/refer/",

  // Referrals are stored in Supabase public.data_referrals
  // (assets/refer-send.js). When that fails, or without JS, the form emails
  // this inbox instead.
  inbox: "hello@gethouston.ai",
  people: ["felipe", "julian"],

  pay,
  headlineShare,
  topDealUsd,
  amountUsd,
  // A company qualifies at the /data-partners bar (the FAQ's 20 full-time
  // employees). Past it, size changes nothing: a referral earns
  // headlineShare of the amount agreed with the company.
  minEmployees: 20,
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
  // Zips with t.refer.track.states.
  states: ["submitted", "in_progress", "reward_confirmed", "paid"],
};
