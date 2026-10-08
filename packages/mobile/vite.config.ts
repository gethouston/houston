import path from "node:path";
import { defineConfig, loadEnv, mergeConfig } from "vite";
import { createWebViteConfig } from "../web/vite.config";
import { mobileBuildEnv } from "./src/build-env";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, __dirname, ""), ...process.env };
  // Local shell builds can reuse only the public Firebase identity values from
  // the repo's .env.local. Loading that file as Vite's envDir would also bake
  // unrelated VITE_* development tokens into the shipped mobile bundle.
  const firebaseDefaults = loadEnv(
    mode,
    path.resolve(__dirname, "../.."),
    "FIREBASE_",
  );
  const { deployEnvironment } = mobileBuildEnv({ ...firebaseDefaults, ...env });
  return mergeConfig(createWebViteConfig(mode, firebaseDefaults), {
    root: __dirname,
    envDir: __dirname,
    base: "./",
    publicDir: path.resolve(__dirname, "../web/public"),
    define: {
      __HOUSTON_MOBILE_DEPLOY_ENV__: JSON.stringify(deployEnvironment),
    },
    build: {
      outDir: path.resolve(__dirname, "dist"),
      rollupOptions: { input: path.resolve(__dirname, "index.html") },
    },
  });
});
