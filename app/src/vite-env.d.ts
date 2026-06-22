/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __POSTHOG_KEY__: string;
declare const __POSTHOG_HOST__: string;
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;
declare const __HOUSTON_AUTH_STORAGE_MODE__: string;
declare const __HOUSTON_AUTH_STORAGE_SCOPE__: string;
declare const __SENTRY_DSN__: string;
declare const __SENTRY_SEND_IN_DEV__: string;

interface ImportMetaEnv {
  /**
   * Percent-full at which Houston proactively compacts a conversation's
   * context (default 93). Optional build-time tuning knob; parsed + clamped
   * to [1, 99] by `resolveThreshold` in `lib/context-usage.ts`. Set it low
   * (e.g. 5) to force compaction while testing.
   */
  readonly VITE_AUTOCOMPACT_THRESHOLD?: string;
}
