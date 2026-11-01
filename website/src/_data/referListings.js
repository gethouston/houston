// Structure for the requests on /data-partners/refer: what each pays and how
// it is sorted. Text lives in _data/i18n/referListings/* (surfaced as
// `t.referListings`, keyed by slug). Every page reads the amounts already
// formatted for its locale (`fmt`), so no template does money math.

import { REQUESTS } from "../../lib/refer-requests.js";
import locales from "./locales.js";
import refer from "./refer.js";

const money = (lang, n, compact) =>
  new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: compact ? 1 : 0,
    ...(compact && { notation: "compact", roundingMode: "trunc" }),
  }).format(n);

const paid = (item) => ({
  ...item,
  dealMinUsd: refer.pay(item.dealMinUsd),
  dealMaxUsd: refer.pay(item.dealMaxUsd),
  referralUsd: refer.pay(item.referralUsd),
  bonuses: item.bonuses.map((b) => ({
    ...b,
    amountUsd: refer.pay(b.amountUsd),
  })),
});
const items = REQUESTS.map(paid);

const withAmounts = (item) => {
  const bonusUsd = item.bonuses.reduce((sum, b) => sum + b.amountUsd, 0);
  const earnUsd = item.referralUsd + bonusUsd;
  const fmt = Object.fromEntries(
    locales.order.map((code) => {
      const lang = locales[code].htmlLang;
      return [
        code,
        {
          earn: money(lang, earnUsd),
          referral: money(lang, item.referralUsd),
          bonus: money(lang, bonusUsd, true),
          bonuses: item.bonuses.map((b) => money(lang, b.amountUsd)),
          dealMin: money(lang, item.dealMinUsd, true),
          dealMax: money(lang, item.dealMaxUsd, true),
        },
      ];
    }),
  );
  // Zips with t.refer.companies.categories, for the category's name.
  const categoryIndex = refer.categories.indexOf(item.category);
  return { ...item, bonusUsd, earnUsd, categoryIndex, fmt };
};

export default {
  items: items.map(withAmounts),
  // The six requests /data-partners shows owners: the top request of each
  // industry, in the program's order, so the sample spans the board.
  featured: refer.categories
    .map((id) => items.find((item) => item.category === id))
    .filter(Boolean)
    .slice(0, 6)
    .map(withAmounts),
  // The board's industry tabs: every category with at least one request, in
  // the program's order.
  categories: refer.categories.filter((id) =>
    items.some((item) => item.category === id),
  ),
};
