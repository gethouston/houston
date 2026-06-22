export default function () {
  return {
    downloadCode: process.env.DOWNLOAD_CODE || "getsh*tdone",
    posthogKey: process.env.POSTHOG_KEY || "",
    posthogHost: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    gaMeasurementId: process.env.GA_MEASUREMENT_ID || "G-GZRKCBT0D0",
    // Waitlist storage. The URL and the Google Sheet endpoint are public. The
    // Supabase anon key is a public, RLS-protected client key, but we inject it
    // at build time (SUPABASE_ANON_KEY) rather than committing the JWT.
    supabaseUrl: process.env.SUPABASE_URL || "https://zfpnlvxazrataiannvtq.supabase.co",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    waitlistSheetEndpoint: process.env.WAITLIST_SHEET_ENDPOINT || "https://script.google.com/macros/s/AKfycbyDkiNQtnEO9XqmAoOXyA_WmS2fs7e0ehqiDvjgYBwXV1vY2V-C4KiDCQ5GHfDJ3kgfdg/exec",
  };
}
