// Single source of truth for Houston pricing.
//
// Every price on the landing pricing section, its FAQ and its JSON-LD renders
// from this module, in all three locales. Do not hardcode a price anywhere
// else: translations take it through the `{price}` placeholder.
export default function () {
  return {
    // Keyed by locale code. Across Latin America and Brazil a bare "$" reads
    // as the local currency, so es and pt name the dollar.
    currency: { en: "$", es: "US$", pt: "US$" },
    // ISO 4217 code for structured data, which cannot use the symbol.
    currencyCode: "USD",
    // Team plan, per seat, per month. Monthly billing is the only option.
    teamMonthly: 15,
  };
}
