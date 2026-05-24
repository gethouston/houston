import type { CapacitorConfig } from "@capacitor/cli";

// Houston Mobile — Capacitor native shell.
//
// The existing React PWA (built into `dist/`) is bundled into the native
// app and served from capacitor://localhost (iOS) / http://localhost
// (Android). Engine traffic still goes to the relay at tunnel.gethouston.ai
// via @houston-ai/engine-client.
//
// CROSS-ORIGIN NOTE: as a PWA the app was same-origin with the relay; bundled
// in Capacitor it is not. Engine auth is bearer-token (not cookies), so the
// only requirement is a relay CORS allowlist for capacitor://localhost +
// http://localhost on the /e/<tunnelId>/v1/*, /pair/*, /push/register routes
// and the WS upgrade. Tracked with the relay work in BRO-50.
const config: CapacitorConfig = {
  appId: "ai.gethouston.companion",
  appName: "Houston",
  webDir: "dist",
  server: {
    // Let the WebView follow the QR pair deep-link host until Chunk 5
    // (BRO-53) replaces it with an in-app camera scan.
    allowNavigation: ["tunnel.gethouston.ai", "tunnel-staging.gethouston.ai"],
  },
  ios: {
    contentInset: "always",
  },
  plugins: {
    PushNotifications: {
      // Foreground presentation; the app de-dupes against in-app banners.
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
