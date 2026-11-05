// Structure only for the /data-partners page. Text lives in
// _data/i18n/dataPartners/* (surfaced as `t.dataPartners`). Arrays here zip by
// index with the i18n arrays, the same contract _data/enterprise.js keeps.

import {
  estimatePayout,
  LIMITS,
  positionFor,
  SLIDER_STEPS,
} from "../assets/payout-model.js";
import enterprise from "./enterprise.js";
import locales from "./locales.js";

// The estimate's coefficients (assets/payout-model.js has the formula), fitted
// to the reference program's published estimator. Retune the program's
// numbers here; the page and the tests both read them.
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
  // Houston pays this share of the reference curve.
  share: 0.6,
  // Zips with t.dataPartners.estimator.regions.
  regions: { US: 1, Canada: 0.75, Europe: 0.75, Other: 0.3 },
};

// The figure the estimator opens on, and the one that stands without JS.
const defaults = { employees: 100, years: 5, region: "US" };
const example = estimatePayout(model, defaults);
const money = (lang, n) =>
  new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default {
  // The URL segment under every locale root ("/data-partners/", "/es/...").
  path: "data-partners/",

  // The calendar. Every booking action on the page opens the call form
  // (data-partners/call-modal.njk) instead, and only a company at the
  // program's bar is then handed this link. Without JS the links open it
  // directly, in a new tab.
  booking: "https://calendly.com/gethouston/30min",
  people: ["felipe", "julian"],

  model,
  // The least a partnership pays: the reference program's $100K floor at
  // Houston's share. The hero, the tiers and the meta description state it,
  // and no request on /data-partners/refer quotes a company less.
  floorUsd: Math.round(100000 * model.share),
  defaults,
  limits: LIMITS,
  slider: { steps: SLIDER_STEPS, start: positionFor(defaults.employees) },
  regionOrder: Object.keys(model.regions),
  // The default estimate, already formatted per locale, for the first paint.
  exampleText: Object.fromEntries(
    locales.order.map((code) => {
      const lang = locales[code].htmlLang;
      return [
        code,
        { low: money(lang, example.low), high: money(lang, example.high) },
      ];
    }),
  ),

  // The employees slider's end labels, formatted per locale ("10,000").
  employeesEnds: Object.fromEntries(
    locales.order.map((code) => {
      const count = new Intl.NumberFormat(locales[code].htmlLang);
      const { min, max } = LIMITS.employees;
      return [code, { min: count.format(min), max: count.format(max) }];
    }),
  ),

  // The hero reel is /enterprise's own, so the two pages stay one look.
  reelDir: enterprise.reelDir,
  reel: enterprise.reel,

  // Zips with t.dataPartners.how.steps: the reel clip whose first frame
  // pictures each step (<reelDir>/<id>.webp, 1280x720).
  steps: [
    "inspectors-tablet",
    "grocery-tablet",
    "warehouse-dock",
    "field-tablet",
  ],

  // Zips with t.dataPartners.why.areas: the glyph each card wears
  // (data-partners/icons.njk).
  areas: ["engineering", "finance", "support", "sales", "legal", "operations"],
  // Zips with t.dataPartners.privacy.points.
  privacy: ["buyers", "separate", "deidentified", "retention"],
};
