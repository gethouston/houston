import {
  estimatePayout,
  LIMITS,
  positionFor,
  SLIDER_STEPS,
} from "../assets/payout-model.js";
import enterprise from "./enterprise.js";
import locales from "./locales.js";

const model = {
  low: {
    base: 105323.6197,
    perEmployee: 1749.7124,
    perYear: 8746.6736,
    perEmployeeYear: 11.8105,
  },
  high: {
    base: 175515.8062,
    perEmployee: 2916.1518,
    perYear: 14570.7631,
    perEmployeeYear: 275.6306,
  },
  share: 0.6,
  regions: { US: 1, Canada: 0.75, Europe: 0.75, Other: 0.3 },
};

const defaults = { employees: 100, years: 5, region: "US" };
const example = estimatePayout(model, defaults);
const money = (lang, n) =>
  new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default {
  path: "data-partners/",

  booking: "https://calendly.com/gethouston/30min",
  people: ["felipe", "julian"],

  model,
  floorUsd: Math.round(100000 * model.share),
  defaults,
  limits: LIMITS,
  slider: { steps: SLIDER_STEPS, start: positionFor(defaults.employees) },
  regionOrder: Object.keys(model.regions),
  exampleText: Object.fromEntries(
    locales.order.map((code) => {
      const lang = locales[code].htmlLang;
      return [
        code,
        { low: money(lang, example.low), high: money(lang, example.high) },
      ];
    }),
  ),

  employeesEnds: Object.fromEntries(
    locales.order.map((code) => {
      const count = new Intl.NumberFormat(locales[code].htmlLang);
      const { min, max } = LIMITS.employees;
      return [code, { min: count.format(min), max: count.format(max) }];
    }),
  ),

  reelDir: enterprise.reelDir,
  reel: enterprise.reel,

  steps: [
    "inspectors-tablet",
    "grocery-tablet",
    "warehouse-dock",
    "field-tablet",
  ],

  areas: ["engineering", "finance", "support", "sales", "legal", "operations"],
  privacy: ["buyers", "separate", "deidentified", "retention"],
};
