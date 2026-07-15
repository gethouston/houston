// Single source of truth for Houston Spaces pricing.
//
// These prices are PLACEHOLDERS for the Spaces launch. Change them here and
// both the English (/pricing/) and Spanish (/pricing/es/) pages update, since
// every price on those pages is rendered from this module. Do not hardcode a
// price anywhere else.
export default function () {
  return {
    currency: "$",
    // Team plan, per seat, per month, billed monthly.
    teamMonthly: 15,
    // Team plan, per seat, per month, when billed annually (the cheaper rate).
    teamAnnual: 12,
    // Length of the invite-triggered free trial, in days.
    trialDays: 14,
    // Where "Contact sales" points. Mirrors the site's existing contact CTA.
    salesEmail: "hello@gethouston.ai",
  };
}
