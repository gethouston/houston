export default function () {
  return {
    posthogKey: process.env.POSTHOG_KEY || "",
    posthogHost: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    gaMeasurementId: process.env.GA_MEASUREMENT_ID || "G-GZRKCBT0D0",
    // Certificates gateway. Public origin the certificate pages call from the
    // browser (claim + verify). The build-time export it also serves is
    // token-gated and read in lib/certs/config.mjs, never here.
    certsGatewayUrl:
      process.env.CERTS_GATEWAY_URL || "https://gateway.gethouston.ai",
    // Download gate and referral storage. The URL and the Google Sheet endpoints are public. The
    // Supabase anon key is a public, RLS-protected client key, but we inject it
    // at build time (SUPABASE_ANON_KEY) rather than committing the JWT.
    supabaseUrl:
      process.env.SUPABASE_URL || "https://zfpnlvxazrataiannvtq.supabase.co",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    // The "Data Partnerships - Referrals" sheet tab's Apps Script web app
    // (scripts/apps-script/data-partnerships-referrals.gs). Public like the
    // one below; empty turns the referral sheet copy off.
    dataReferralsSheetEndpoint: process.env.DATA_REFERRALS_SHEET_ENDPOINT || "",
    // The "Data Partnerships - Calls" tab's web app
    // (scripts/apps-script/data-partnerships-calls.gs), for the /data-partners
    // "Book a call" form. Empty turns that sheet copy off.
    dataPartnerCallsSheetEndpoint:
      process.env.DATA_PARTNER_CALLS_SHEET_ENDPOINT || "",
    waitlistSheetEndpoint:
      process.env.WAITLIST_SHEET_ENDPOINT ||
      "https://script.google.com/macros/s/AKfycbyDkiNQtnEO9XqmAoOXyA_WmS2fs7e0ehqiDvjgYBwXV1vY2V-C4KiDCQ5GHfDJ3kgfdg/exec",
  };
}
