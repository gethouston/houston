/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __POSTHOG_KEY__: string;
declare const __POSTHOG_HOST__: string;
declare const __FIREBASE_API_KEY__: string;
declare const __FIREBASE_AUTH_DOMAIN__: string;
declare const __FIREBASE_PROJECT_ID__: string;
declare const __GOOGLE_DESKTOP_CLIENT_ID__: string;
declare const __GOOGLE_DESKTOP_CLIENT_SECRET__: string;
declare const __HOUSTON_AUTH_STORAGE_MODE__: string;
declare const __HOUSTON_AUTH_STORAGE_SCOPE__: string;
declare const __SENTRY_DSN__: string;
declare const __SENTRY_SEND_IN_DEV__: string;

interface ImportMetaEnv {
  /** Dev-only Firebase config overrides (identity/config.ts), no rebuild. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
}
