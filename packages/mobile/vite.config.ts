import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, mergeConfig, type Plugin } from "vite";
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
  const buildEnv = mobileBuildEnv({ ...firebaseDefaults, ...env });
  const appVersion = JSON.parse(
    readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"),
  ).version as string;
  const sha = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
    cwd: __dirname,
    encoding: "utf8",
  }).trim();
  const bundleVersion = `${appVersion}+${sha}`;
  const nativeCompat = readFileSync(
    path.resolve(__dirname, "native-compat.json"),
    "utf8",
  );
  const versionPlugin: Plugin = {
    name: "mobile-version-file",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: bundleVersion }),
      });
      this.emitFile({
        type: "asset",
        fileName: "native-compat.json",
        source: nativeCompat,
      });
    },
  };
  return mergeConfig(createWebViteConfig(mode, firebaseDefaults), {
    plugins: [versionPlugin],
    root: __dirname,
    envDir: __dirname,
    base: "./",
    publicDir: path.resolve(__dirname, "../web/public"),
    define: {
      __HOUSTON_MOBILE_CONTROL_PLANE_URL__: JSON.stringify(
        buildEnv.controlPlaneUrl,
      ),
      __HOUSTON_MOBILE_DEPLOY_ENV__: JSON.stringify(buildEnv.deployEnvironment),
      __HOUSTON_MOBILE_UPDATE_BASE_URL__: JSON.stringify(
        buildEnv.updateBaseUrl,
      ),
      __HOUSTON_MOBILE_UPDATE_PUBKEY__: JSON.stringify(
        buildEnv.updatePublicKey,
      ),
      __HOUSTON_MOBILE_STORE_URL_IOS__: JSON.stringify(buildEnv.storeUrlIos),
      __HOUSTON_MOBILE_STORE_URL_ANDROID__: JSON.stringify(
        buildEnv.storeUrlAndroid,
      ),
      __HOUSTON_MOBILE_BUNDLE_VERSION__: JSON.stringify(bundleVersion),
      __HOUSTON_NATIVE_PUSH_IOS_AVAILABLE__: JSON.stringify(
        existsSync(
          path.resolve(__dirname, "ios/App/App/GoogleService-Info.plist"),
        ),
      ),
      __HOUSTON_NATIVE_PUSH_ANDROID_AVAILABLE__: JSON.stringify(
        existsSync(path.resolve(__dirname, "android/app/google-services.json")),
      ),
    },
    build: {
      outDir: path.resolve(__dirname, "dist"),
      rollupOptions: { input: path.resolve(__dirname, "index.html") },
    },
  });
});
