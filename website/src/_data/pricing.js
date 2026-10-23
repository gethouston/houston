// Single source of truth for Houston pricing.
//
// Every price on the landing pricing section, its FAQ and its JSON-LD renders
// from this module, in all three locales. Do not hardcode a price anywhere
// else: translations take it through the `{price}`, `{yearlyPrice}`,
// `{yearlyTotal}` and `{save}` placeholders.
export default function () {
  // Team plan, per seat, per month, billed monthly.
  const teamMonthly = 20;
  // Team plan, per seat, per year, billed yearly.
  const teamYearly = 180;
  return {
    // Keyed by locale code. Across Latin America and Brazil a bare "$" reads
    // as the local currency, so es and pt name the dollar.
    currency: { en: "$", es: "US$", pt: "US$" },
    // ISO 4217 code for structured data, which cannot use the symbol.
    currencyCode: "USD",
    teamMonthly,
    teamYearly,
    // The yearly price shown as a monthly rate, so the two compare at a glance.
    teamYearlyPerMonth: teamYearly / 12,
    // What yearly billing saves against monthly, as a whole percent (the
    // Yearly badge), rounded down so the badge never overstates it.
    teamYearlySavePercent: Math.floor(
      (1 - teamYearly / 12 / teamMonthly) * 100,
    ),
  };
}
