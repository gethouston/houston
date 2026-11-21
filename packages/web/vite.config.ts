import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type UserConfig } from "vite";
import { version } from "./package.json";
import { appAssociationPlugin } from "./src/app-association";

const repoRoot = path.resolve(__dirname, "../..");
const appSrc = path.resolve(__dirname, "../../app/src");
const shim = (file: string) => path.resolve(__dirname, "src/shims", file);

export function createWebViteConfig(
  mode: string,
  fallbackEnv: Record<string, string> = {},
  identityModule = path.resolve(__dirname, "src/identity/firebase-popup.ts"),
  includeAppAssociations = true,
): UserConfig {
  const envDir = mode === "host" ? repoRoot : path.resolve(__dirname);
  const env = { ...fallbackEnv, ...loadEnv(mode, envDir, ""), ...process.env };
  const port = Number(process.env.HOUSTON_E2E_WEB_PORT || 1430);
  return {
    envDir,
    cacheDir: path.resolve(__dirname, `node_modules/.vite/dev-${port}`),
    plugins: [
      react(),
      tailwindcss(),
      ...(includeAppAssociations ? [appAssociationPlugin(env)] : []),
    ],
    resolve: {
      alias: [
        {
          find: "@houston/web-identity",
          replacement: identityModule,
        },
        { find: "@tauri-apps/api/core", replacement: shim("tauri-core.ts") },
        { find: "@tauri-apps/api/event", replacement: shim("tauri-event.ts") },
        {
          find: "@tauri-apps/plugin-deep-link",
          replacement: shim("tauri-plugin-deep-link.ts"),
        },
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
        { find: /^@houston\/app\/(.*)$/, replacement: `${appSrc}/$1` },
        { find: "@houston/app", replacement: appSrc },
      ],
    },
    define: {
      __APP_VERSION__: JSON.stringify(
        mode === "production" ? `${version}-web` : `${version}-web-dev`,
      ),
      __POSTHOG_KEY__: JSON.stringify(env.POSTHOG_KEY ?? ""),
      __POSTHOG_HOST__: JSON.stringify(
        env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      ),
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
      __GOOGLE_DESKTOP_CLIENT_SECRET__: JSON.stringify(
        env.GOOGLE_DESKTOP_CLIENT_SECRET ?? "",
      ),
      __HOUSTON_AUTH_STORAGE_MODE__: JSON.stringify("browser"),
      __HOUSTON_AUTH_STORAGE_SCOPE__: JSON.stringify("web"),
      __SENTRY_DSN__: JSON.stringify(env.SENTRY_DSN ?? ""),
      __SENTRY_SEND_IN_DEV__: JSON.stringify(env.SENTRY_SEND_IN_DEV ?? ""),
    },
    optimizeDeps: {
      exclude: [
        "@houston/engine-adapter",
        "@houston/runtime-client",
        "@houston-ai/chat",
        "@houston-ai/core",
        "@houston-ai/board",
        "@houston-ai/layout",
        "@houston-ai/events",
        "@houston-ai/routines",
        "@houston-ai/skills",
        "@houston-ai/pdf",
        "@houston-ai/review",
        "@houston-ai/agent",
      ],
    },
    server: {
      port: Number(process.env.HOUSTON_E2E_WEB_PORT || 1430),
      strictPort: true,
      fs: { allow: [repoRoot] },
    },
    build: {
      sourcemap: "hidden",
      rollupOptions: {
        input: {
          app: path.resolve(__dirname, "index.html"),
          connected: path.resolve(__dirname, "connected/index.html"),
        },
      },
    },
  };
}

export default defineConfig(({ mode }) => createWebViteConfig(mode));
