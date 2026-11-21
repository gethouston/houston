import { REQUESTS } from "../../lib/refer-requests.js";
import dataPartners from "./dataPartners.js";
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
  dealMinUsd: Math.max(refer.pay(item.dealMinUsd), dataPartners.floorUsd),
  dealMaxUsd: refer.pay(item.dealMaxUsd),
  referralUsd: Math.round(refer.pay(item.dealMaxUsd) * refer.headlineShare),
  bonuses: item.bonuses.map((b) => ({
    ...b,
    amountUsd: refer.pay(b.amountUsd),
  })),
});
const items = REQUESTS.map(paid).sort(
  (a, b) => refer.pay(b.dealMaxUsd) - refer.pay(a.dealMaxUsd),
);

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
  const categoryIndex = refer.categories.indexOf(item.category);
  return { ...item, bonusUsd, earnUsd, categoryIndex, fmt };
};

export default {
  items: items.map(withAmounts),
  featured: refer.categories
    .map((id) => items.find((item) => item.category === id))
    .filter(Boolean)
    .slice(0, 6)
    .map(withAmounts),
  categories: refer.categories.filter((id) =>
    items.some((item) => item.category === id),
  ),
};
