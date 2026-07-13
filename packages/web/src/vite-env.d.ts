/// <reference types="vite/client" />

// Build-time globals, mirrored from app/vite.config.ts's `define` block and
// app/src/vite-env.d.ts. app/src files reference these (guarded with
// `typeof __X__ !== "undefined"`), so the web program must declare them too.
declare const __APP_VERSION__: string;
declare const __POSTHOG_KEY__: string;
declare const __POSTHOG_HOST__: string;
declare const __FIREBASE_API_KEY__: string;
declare const __FIREBASE_AUTH_DOMAIN__: string;
declare const __FIREBASE_PROJECT_ID__: string;
declare const __APPLE_SIGN_IN_ENABLED__: string;
declare const __GOOGLE_DESKTOP_CLIENT_ID__: string;
declare const __GOOGLE_DESKTOP_CLIENT_SECRET__: string;
declare const __MICROSOFT_DESKTOP_CLIENT_ID__: string;
declare const __HOUSTON_AUTH_STORAGE_MODE__: string;
declare const __HOUSTON_AUTH_STORAGE_SCOPE__: string;
declare const __SENTRY_DSN__: string;
declare const __SENTRY_SEND_IN_DEV__: string;

// Augments (does not replace) Vite's built-in ImportMetaEnv — needed by
// app/src/lib/autocompact.ts.
interface ImportMetaEnv {
  readonly VITE_AUTOCOMPACT_THRESHOLD?: string;
  /** Dev-only Firebase config overrides (identity/config.ts), no rebuild. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
}

// The web boot sets this from the Connect screen / localStorage before the app
// module graph loads; app/src/lib/engine.ts reads it. Declared here to match
// that module's global augmentation (compatible merge).
interface Window {
  __HOUSTON_ENGINE__?: { baseUrl: string; token: string };
  /** When true, the engine-adapter routes agents + chat through the control plane (cloud). */
  __HOUSTON_CP__?: boolean;
  /** Runtime deploy environment, set by main.tsx from the hostname so the shared
   *  Sentry/PostHog init can tag `environment` on ONE bundle served from both
   *  the preview and production sites (see src/deploy-environment.ts). */
  __HOUSTON_DEPLOY_ENV__?: "production" | "preview" | "development";
  /** Hosted-session refresher: mints a fresh Supabase access token on a
   *  gateway 401 so the adapter can replay the request (HOU-687). */
  __HOUSTON_SESSION_REFRESH__?: () => Promise<string | null>;
}
