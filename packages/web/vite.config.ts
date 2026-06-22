import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { version } from "./package.json";

// packages/web composes the desktop app's React tree (app/src) and runs it in a
// plain browser tab pointed at a remote houston-engine. The ONLY platform
// coupling app/src has is a handful of `@tauri-apps/*` imports; we redirect each
// specifier to a browser shim under ./src/shims. `@houston/app/*` aliases into
// app/src so we can reuse it verbatim — no fork, no app/ changes.
//
// Keep these aliases in lockstep with the `paths` block in tsconfig.json.
const repoRoot = path.resolve(__dirname, "../..");
const appSrc = path.resolve(__dirname, "../../app/src");
const shim = (file: string) => path.resolve(__dirname, "src/shims", file);

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  // Target the new TS engine (packages/engine) when VITE_NEW_ENGINE is truthy,
  // or when a URL is baked via VITE_NEW_ENGINE_URL. In that mode we swap the
  // engine client for the new-engine adapter so the entire desktop UI (app/src)
  // runs on the new engine. Otherwise the old-engine path is untouched.
  const useNewEngine =
    env.VITE_NEW_ENGINE === "1" ||
    env.VITE_NEW_ENGINE === "true" ||
    Boolean(env.VITE_NEW_ENGINE_URL);
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        // New-engine mode (see `useNewEngine` above) and cloud mode
        // (VITE_CONTROL_PLANE_URL) both route @houston-ai/engine-client through
        // the new-engine adapter so the whole desktop UI runs on the new TS
        // runtime / the control plane.
        ...(useNewEngine || env.VITE_CONTROL_PLANE_URL
          ? [
              {
                find: "@houston-ai/engine-client",
                replacement: path.resolve(
                  __dirname,
                  "src/engine-adapter/index.ts",
                ),
              },
            ]
          : []),
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
      __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL ?? ""),
      __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY ?? ""),
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
      port: 1430,
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
