import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ai.gethouston.app",
  appName: "Houston",
  webDir: "dist",
  // A long-press link preview opens the URL inside WebKit, outside the app's
  // click handlers, so it would bypass the store-safe link guards.
  ios: { allowsLinkPreview: false },
  plugins: {
    // Native resizes the WebView itself. The existing visualViewport hook
    // measures remaining occlusion, so the composer never gets two insets.
    // Android edge-to-edge can look full screen to the keyboard plugin. Force
    // the WebView resize there too; the viewport hook observes the final edge.
    Keyboard: { resize: "native", resizeOnFullScreen: true },
    SystemBars: { insetsHandling: "css", style: "LIGHT" },
    SplashScreen: { launchAutoHide: true },
  },
};

export default config;
