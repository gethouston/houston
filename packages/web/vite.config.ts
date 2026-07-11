import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { version } from "./package.json";

// packages/web composes the desktop app's React tree (app/src) and runs it in a
// plain browser tab pointed at the Houston host. The ONLY platform coupling
// app/src has is a handful of `@tauri-apps/*` imports; we redirect each
// specifier to a browser shim under ./src/shims. `@houston/app/*` aliases into
// app/src so we can reuse it verbatim — no fork, no app/ changes.
//
// Keep these aliases in lockstep with the `paths` block in tsconfig.json.
const repoRoot = path.resolve(__dirname, "../..");
const appSrc = path.resolve(__dirname, "../../app/src");
const shim = (file: string) => path.resolve(__dirname, "src/shims", file);

export default defineConfig(({ mode }) => {
  // `pnpm dev:host` runs `vite --mode host`: load the shared repo-root .env.local
  // (host token + the frontend's host URL/token) instead of a
  // package-local .env, so the browser dev server points at the local host with
  // no flags. Plain `pnpm dev` (mode=development) keeps the default package
  // envDir, so the Connect screen prompts for a host URL + token.
  const envDir = mode === "host" ? repoRoot : process.cwd();
  const env = { ...loadEnv(mode, envDir, ""), ...process.env };
  return {
    envDir,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        // The Houston host (packages/host) is the only engine, so
        // `@houston-ai/engine-client` always resolves to the v3 host adapter —
        // the whole desktop UI (app/src) runs on the host / control plane.
        {
          find: "@houston-ai/engine-client",
          replacement: path.resolve(__dirname, "src/engine-adapter/index.ts"),
        },
        // The web-only Firebase Auth surface — the real firebase-js-sdk module.
        // app/vite.config.ts maps this specifier to a stub so firebase never
        // ships to desktop.
        {
          find: "@houston/web-identity",
          replacement: path.resolve(
            __dirname,
            "src/identity/firebase-popup.ts",
          ),
        },
        { find: "@tauri-apps/api/core", replacement: shim("tauri-core.ts") },
        { find: "@tauri-apps/api/event", replacement: shim("tauri-event.ts") },
        {
          find: "@tauri-apps/api/window",
          replacement: shim("tauri-window.ts"),
        },
        {
          find: "@tauri-apps/plugin-updater",
          replacement: shim("tauri-plugin-updater.ts"),
        },
        {
          find: "@tauri-apps/plugin-notification",
          replacement: shim("tauri-plugin-notification.ts"),
        },
        // Order matters: the `/*` regex must come before the bare alias.
        { find: /^@houston\/app\/(.*)$/, replacement: `${appSrc}/$1` },
        { find: "@houston/app", replacement: appSrc },
      ],
    },
    define: {
      // Mirror app/vite.config.ts's build-time globals. app/src consumers all
      // guard with `typeof __X__ !== "undefined"`, so an absent one is safe —
      // but we define them anyway for parity. Auth storage is FORCED to the
      // browser (localStorage) adapter: a browser tab has no OS keychain.
      __APP_VERSION__: JSON.stringify(
        mode === "production" ? `${version}-web` : `${version}-web-dev`,
      ),
      __POSTHOG_KEY__: JSON.stringify(env.POSTHOG_KEY ?? ""),
      __POSTHOG_HOST__: JSON.stringify(
        env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      ),
      // GCP Identity Platform (Firebase Auth), project `gethouston` — mirror of
      // app/vite.config.ts. Public values (apiKey is not a secret). The web build
      // uses firebase-js-sdk (popup); the desktop client id below is a no-op here
      // but kept for define parity so app/src references it in both bundles.
      __FIREBASE_API_KEY__: JSON.stringify(env.FIREBASE_API_KEY ?? ""),
      __FIREBASE_AUTH_DOMAIN__: JSON.stringify(
        env.FIREBASE_AUTH_DOMAIN ?? "gethouston.firebaseapp.com",
      ),
      __FIREBASE_PROJECT_ID__: JSON.stringify(
        env.FIREBASE_PROJECT_ID ?? "gethouston",
      ),
      __GOOGLE_DESKTOP_CLIENT_ID__: JSON.stringify(
        env.GOOGLE_DESKTOP_CLIENT_ID ?? "",
      ),
      // Mirror of app/vite.config.ts for define parity — desktop-only sign-in
      // never runs in the web bundle, but app/src references these globals in
      // both builds. Web CI does not set these envs, so both bake to "".
      __GOOGLE_DESKTOP_CLIENT_SECRET__: JSON.stringify(
        env.GOOGLE_DESKTOP_CLIENT_SECRET ?? "",
      ),
      __MICROSOFT_DESKTOP_CLIENT_ID__: JSON.stringify(
        env.MICROSOFT_DESKTOP_CLIENT_ID ?? "",
      ),
      __HOUSTON_AUTH_STORAGE_MODE__: JSON.stringify("browser"),
      __HOUSTON_AUTH_STORAGE_SCOPE__: JSON.stringify("web"),
      __SENTRY_DSN__: JSON.stringify(env.SENTRY_DSN ?? ""),
      // Mirror app/vite.config.ts: opt-in (truthy) to send Sentry events from a
      // dev build; unset → the dev server suppresses Sentry (see
      // app/src/lib/sentry-dev.ts). A dev running the web server with the prod
      // DSN baked would otherwise pollute the prod project.
      __SENTRY_SEND_IN_DEV__: JSON.stringify(env.SENTRY_SEND_IN_DEV ?? ""),
    },
    // Don't pre-bundle the workspace UI packages so live edits flow through
    // (mirrors app/vite.config.ts).
    optimizeDeps: {
      exclude: [
        "@houston/runtime-client",
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
      // Overridable so parallel worktrees' e2e runs never share a server
      // (see packages/fake-host/src/config.ts for the matching fake-host
      // override and the why).
      port: Number(process.env.HOUSTON_E2E_WEB_PORT || 1430),
      strictPort: true,
      // We import from app/src and the @houston-ai source packages, which live
      // outside this package root — allow the whole monorepo.
      fs: { allow: [repoRoot] },
    },
    build: {
      // "hidden" emits .map files but omits the sourceMappingURL comment, so
      // users can't reconstruct source via DevTools (matches app/vite.config.ts).
      // A future web release pipeline can upload these maps to Sentry.
      sourcemap: "hidden",
    },
  };
});
