export default function () {
  return {
    posthogKey: process.env.POSTHOG_KEY || "",
    posthogHost: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    gaMeasurementId: process.env.GA_MEASUREMENT_ID || "G-GZRKCBT0D0",
    certsGatewayUrl:
      process.env.CERTS_GATEWAY_URL || "https://gateway.gethouston.ai",
    supabaseUrl:
      process.env.SUPABASE_URL || "https://zfpnlvxazrataiannvtq.supabase.co",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    dataReferralsSheetEndpoint: process.env.DATA_REFERRALS_SHEET_ENDPOINT || "",
    dataPartnerCallsSheetEndpoint:
      process.env.DATA_PARTNER_CALLS_SHEET_ENDPOINT || "",
    waitlistSheetEndpoint:
      process.env.WAITLIST_SHEET_ENDPOINT ||
      "https://script.google.com/macros/s/AKfycbyDkiNQtnEO9XqmAoOXyA_WmS2fs7e0ehqiDvjgYBwXV1vY2V-C4KiDCQ5GHfDJ3kgfdg/exec",
  };
}
