import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { version } from "./package.json";

const host = process.env.TAURI_DEV_HOST;
const appRoot = realpathSync(process.cwd());
const authStorageScope = createHash("sha256")
  .update(appRoot)
  .digest("hex")
  .slice(0, 16);

function resolveAuthStorageMode(
  mode: string,
  env: Record<string, string | undefined>,
) {
  const override = env.HOUSTON_AUTH_STORAGE?.trim().toLowerCase();
  if (override === "keychain" || override === "browser") return override;
  if (override) {
    throw new Error("HOUSTON_AUTH_STORAGE must be keychain or browser");
  }

  if (mode !== "production") return "browser";
  if (env.CI === "true") return "keychain";
  return "browser";
}

// Pick from either the shell or a local `.env.local` (gitignored). CI sets
// the vars in the shell via GitHub Secrets; locally you drop them in
// `app/.env.local` so `pnpm tauri dev` picks them up without exports.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const authStorageMode = resolveAuthStorageMode(mode, env);
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      // The Houston host (packages/host) is the only engine, so
      // `@houston-ai/engine-client` always resolves to the v3 host adapter.
      // The desktop talks to a spawned local host sidecar, an external host
      // (VITE_NEW_ENGINE_URL), or a hosted gateway (VITE_HOSTED_ENGINE_URL) —
      // all v3. Mirrors packages/web.
      alias: [
        {
          find: "@houston-ai/engine-client",
          replacement: path.resolve(
            __dirname,
            "../packages/web/src/engine-adapter/index.ts",
          ),
        },
        // The web-only Firebase Auth surface. Desktop resolves the STUB so
        // firebase-js-sdk never ships to desktop; the web bundle points this
        // same specifier at the real module (packages/web/vite.config.ts).
        {
          find: "@houston/web-identity",
          replacement: path.resolve(
            __dirname,
            "src/lib/identity/firebase-popup-stub.ts",
          ),
        },
      ],
    },
    define: {
      __APP_VERSION__: JSON.stringify(
        mode === "production" ? version : `${version}-dev`,
      ),
      __POSTHOG_KEY__: JSON.stringify(env.POSTHOG_KEY ?? ""),
      __POSTHOG_HOST__: JSON.stringify(
        env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      ),
      // GCP Identity Platform (Firebase Auth), project `gethouston`. All three
      // are PUBLIC values (the apiKey is not a secret, exactly as the Supabase
      // anon key was), so baking them into the bundle is safe.
      __FIREBASE_API_KEY__: JSON.stringify(env.FIREBASE_API_KEY ?? ""),
      __FIREBASE_AUTH_DOMAIN__: JSON.stringify(
        env.FIREBASE_AUTH_DOMAIN ?? "gethouston.firebaseapp.com",
      ),
      __FIREBASE_PROJECT_ID__: JSON.stringify(
        env.FIREBASE_PROJECT_ID ?? "gethouston",
      ),
      // Gates the "Continue with Apple" button: the GCIP apple.com provider
      // needs one-time Apple Developer + console config, and an unconfigured
      // build must not show a sign-in method that can only error. Set
      // APPLE_SIGN_IN_ENABLED=1 once the provider is live.
      __APPLE_SIGN_IN_ENABLED__: JSON.stringify(
        env.APPLE_SIGN_IN_ENABLED ?? "",
      ),
      // Desktop-only: the "Desktop app" Google OAuth client used by the
      // loopback + PKCE sign-in. Google installed-app clients require the
      // client secret in the code→token exchange; it is non-confidential
      // (Google treats desktop secrets as public) and the TS side owns the
      // exchange (google-authorize.ts), so the Rust loopback stays a dumb
      // listener. Baked from build env, never a committed literal.
      __GOOGLE_DESKTOP_CLIENT_ID__: JSON.stringify(
        env.GOOGLE_DESKTOP_CLIENT_ID ?? "",
      ),
      __GOOGLE_DESKTOP_CLIENT_SECRET__: JSON.stringify(
        env.GOOGLE_DESKTOP_CLIENT_SECRET ?? "",
      ),
      // Desktop-only: the Microsoft (Entra) native/public OAuth client for the
      // loopback + PKCE sign-in. Public client — no secret in the exchange.
      __MICROSOFT_DESKTOP_CLIENT_ID__: JSON.stringify(
        env.MICROSOFT_DESKTOP_CLIENT_ID ?? "",
      ),
      __HOUSTON_AUTH_STORAGE_MODE__: JSON.stringify(authStorageMode),
      __HOUSTON_AUTH_STORAGE_SCOPE__: JSON.stringify(authStorageScope),
      __SENTRY_DSN__: JSON.stringify(env.SENTRY_DSN ?? ""),
      // Opt-in to send Sentry events from a dev build. Unset (default) → dev
      // builds suppress Sentry entirely (see lib/sentry-dev.ts). Release builds
      // ignore it. Picked up from the shell or app/.env.local like the rest.
      __SENTRY_SEND_IN_DEV__: JSON.stringify(env.SENTRY_SEND_IN_DEV ?? ""),
    },
    build: {
      // "hidden" emits .map files next to bundled JS but skips the
      // //# sourceMappingURL= comment, so production users can't reconstruct
      // source via DevTools. The release.yml CI step uploads these maps to
      // Sentry tagged `houston-app@<version>` (the same release reported at
      // runtime by sentry::release_name!() in lib.rs and the JS RELEASE in
      // lib/sentry.ts); Sentry resolves frames to source by release + file
      // path. Maps are uploaded ONLY by that CI release step — local builds
      // emit maps but never upload them.
      sourcemap: "hidden",
    },
    clearScreen: false,
    // Exclude workspace packages from Vite's dep pre-bundling so live edits
    // are picked up immediately without stale cache issues.
    optimizeDeps: {
      exclude: [
        "@houston-ai/chat",
        "@houston-ai/core",
        "@houston-ai/board",
        "@houston-ai/layout",
        "@houston-ai/events",
        "@houston-ai/routines",
        "@houston-ai/skills",
        "@houston-ai/review",
        "@houston-ai/agent",
      ],
    },
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
      watch: { ignored: ["**/src-tauri/**"] },
    },
  };
});
