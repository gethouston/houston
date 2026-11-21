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

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const authStorageMode = resolveAuthStorageMode(mode, env);
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
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
      __HOUSTON_AUTH_STORAGE_MODE__: JSON.stringify(authStorageMode),
      __HOUSTON_AUTH_STORAGE_SCOPE__: JSON.stringify(authStorageScope),
      __SENTRY_DSN__: JSON.stringify(env.SENTRY_DSN ?? ""),
      __SENTRY_SEND_IN_DEV__: JSON.stringify(env.SENTRY_SEND_IN_DEV ?? ""),
    },
    build: {
      sourcemap: "hidden",
    },
    clearScreen: false,
    optimizeDeps: {
      exclude: [
        "@houston/engine-adapter",
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
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
      watch: { ignored: ["**/src-tauri/**"] },
    },
  };
});
