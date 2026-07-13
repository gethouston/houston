// GCP Identity Platform (Firebase Auth) client config, project `gethouston`.
//
// `__FIREBASE_API_KEY__` / `__FIREBASE_AUTH_DOMAIN__` / `__FIREBASE_PROJECT_ID__`
// are baked at build time by Vite `define` (app/vite.config.ts +
// packages/web/vite.config.ts) from the `FIREBASE_*` build env. All three are
// PUBLIC values (the Firebase "apiKey" is not a secret — access is gated by
// GCIP provider config + gateway allowlist), so baking them into the bundle is
// safe, exactly as the Supabase anon key was.
//
// A developer can override at dev time WITHOUT a rebuild via `VITE_FIREBASE_*`
// (import.meta.env), so pointing a local build at a scratch Firebase project is
// a `.env.local` edit, not a code change.

export interface IdentityConfig {
  /** Firebase Web API key — the `?key=` on every identitytoolkit call. */
  apiKey: string;
  /** e.g. `gethouston.firebaseapp.com` — the GCIP handler / popup domain. */
  authDomain: string;
  /** e.g. `gethouston` — the token issuer/audience the gateway verifies. */
  projectId: string;
}

function devEnv(key: string): string {
  // `import.meta.env` is present under Vite; absent under `node:test` (where
  // this module is unit-tested). The cast keeps both paths type-safe.
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  return env?.[key]?.trim() ?? "";
}

/** Pure resolver — baked value wins, dev env is the fallback. Testable. */
export function resolveIdentityConfig(sources: {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  devApiKey?: string;
  devAuthDomain?: string;
  devProjectId?: string;
}): IdentityConfig {
  return {
    apiKey: (sources.apiKey || sources.devApiKey || "").trim(),
    authDomain: (sources.authDomain || sources.devAuthDomain || "").trim(),
    projectId: (sources.projectId || sources.devProjectId || "").trim(),
  };
}

/**
 * Pure gate predicate. Configured ⇔ an API key AND a project id are present
 * (the two values every REST call and the token issuer/audience need). The
 * auth domain is only used by the web popup SDK, so it does not gate.
 */
export function identityConfigured(config: IdentityConfig): boolean {
  return Boolean(config.apiKey && config.projectId);
}

/**
 * Pure predicate for the Apple sign-in gate: truthy flag values switch the
 * button on. Baked value wins, dev env is the fallback (same precedence as
 * the identity config). Testable.
 */
export function appleSignInFlagEnabled(baked: string, dev: string): boolean {
  const v = (baked || dev).trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/**
 * Whether "Continue with Apple" renders. Gated separately from
 * `isIdentityConfigured()`: the GCIP `apple.com` provider needs one-time
 * Apple Developer + console config (see knowledge-base/auth.md), and an
 * unconfigured build must never show a sign-in method that can only error.
 * Bake `APPLE_SIGN_IN_ENABLED=1` (or set `VITE_APPLE_SIGN_IN_ENABLED=1` in
 * dev) once the provider is live.
 */
export function isAppleSignInEnabled(): boolean {
  return appleSignInFlagEnabled(
    typeof __APPLE_SIGN_IN_ENABLED__ !== "undefined"
      ? __APPLE_SIGN_IN_ENABLED__
      : "",
    devEnv("VITE_APPLE_SIGN_IN_ENABLED"),
  );
}

/** The resolved config for the current build. */
export const identityConfig: IdentityConfig = resolveIdentityConfig({
  apiKey:
    typeof __FIREBASE_API_KEY__ !== "undefined" ? __FIREBASE_API_KEY__ : "",
  authDomain:
    typeof __FIREBASE_AUTH_DOMAIN__ !== "undefined"
      ? __FIREBASE_AUTH_DOMAIN__
      : "",
  projectId:
    typeof __FIREBASE_PROJECT_ID__ !== "undefined"
      ? __FIREBASE_PROJECT_ID__
      : "",
  devApiKey: devEnv("VITE_FIREBASE_API_KEY"),
  devAuthDomain: devEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  devProjectId: devEnv("VITE_FIREBASE_PROJECT_ID"),
});

/**
 * Master gate — the Firebase analogue of the old `isAuthConfigured()`. An
 * unconfigured build (no baked Firebase creds) skips auth entirely, so local
 * dev without secrets still boots.
 */
export function isIdentityConfigured(): boolean {
  return identityConfigured(identityConfig);
}
