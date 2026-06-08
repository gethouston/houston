/// <reference types="vite/client" />

// Build-time globals, mirrored from app/vite.config.ts's `define` block and
// app/src/vite-env.d.ts. app/src files reference these (guarded with
// `typeof __X__ !== "undefined"`), so the web program must declare them too.
declare const __APP_VERSION__: string;
declare const __POSTHOG_KEY__: string;
declare const __POSTHOG_HOST__: string;
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;
declare const __HOUSTON_AUTH_STORAGE_MODE__: string;
declare const __HOUSTON_AUTH_STORAGE_SCOPE__: string;
declare const __SENTRY_DSN__: string;

// Augments (does not replace) Vite's built-in ImportMetaEnv — needed by
// app/src/lib/autocompact.ts.
interface ImportMetaEnv {
  readonly VITE_AUTOCOMPACT_THRESHOLD?: string;
}

// The web boot sets this from the Connect screen / localStorage before the app
// module graph loads; app/src/lib/engine.ts reads it. Declared here to match
// that module's global augmentation (compatible merge).
interface Window {
  __HOUSTON_ENGINE__?: { baseUrl: string; token: string };
}
