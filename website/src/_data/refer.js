import { REQUESTS } from "../../lib/refer-requests.js";
import dataPartners from "./dataPartners.js";
import locales from "./locales.js";

const pay = (referenceUsd) =>
  Math.round(referenceUsd * dataPartners.model.share);
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
  path: "data-partners/refer/",

  people: ["felipe", "julian"],

  pay,
  headlineShare,
  topDealUsd,
  amountUsd,
  minEmployees: 20,
  maxOpenReferrals: 5,
  amountText: Object.fromEntries(
    locales.order.map((code) => [
      code,
      money(locales[code].htmlLang, amountUsd),
    ]),
  ),

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
  steps: ["find", "refer", "work", "paid"],
  states: ["submitted", "in_progress", "reward_confirmed", "paid"],
};
