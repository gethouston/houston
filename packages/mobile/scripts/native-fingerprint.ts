import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const NATIVE_FILES = [
  "capacitor.config.ts",
  "ios/App/App/Info.plist",
  "ios/App/App/App.entitlements",
  "ios/App/App/AppDelegate.swift",
  "ios/App/App/SceneDelegate.swift",
  "android/app/src/main/AndroidManifest.xml",
  "android/app/src/main/java/ai/gethouston/app/MainActivity.java",
  "android/app/src/main/res/xml/data_extraction_rules.xml",
  "android/app/src/main/res/xml/file_paths.xml",
] as const;

const isNativePackage = (name: string) =>
  (name.startsWith("@capacitor/") && name !== "@capacitor/assets") ||
  name.startsWith("@capacitor-firebase/") ||
  name.startsWith("@capgo/");

export function lockedNativeVersions(lockfile: string): Record<string, string> {
  const start = lockfile.indexOf("\n  packages/mobile:\n");
  if (start < 0)
    throw new Error("pnpm-lock.yaml has no packages/mobile importer");
  const rest = lockfile.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}\S/);
  const block = end < 0 ? rest : rest.slice(0, end + 1);
  const versions: Record<string, string> = {};
  for (const match of block.matchAll(
    /\n {6}'?([^'\n:]+)'?:\n {8}specifier: [^\n]+\n {8}version: ([^\s(]+)/g,
  )) {
    const [, name, version] = match;
    if (name && version && isNativePackage(name)) versions[name] = version;
  }
  if (!versions["@capacitor/core"])
    throw new Error(
      "pnpm-lock.yaml lists no @capacitor/core for packages/mobile",
    );
  return Object.fromEntries(
    Object.entries(versions).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function nativeFingerprint(mobileDir: string): string {
  const lockfile = readFileSync(
    path.join(mobileDir, "../../pnpm-lock.yaml"),
    "utf8",
  );
  const hash = createHash("sha256").update(
    JSON.stringify(lockedNativeVersions(lockfile)),
  );
  for (const file of NATIVE_FILES) {
    const text = readFileSync(path.join(mobileDir, file), "utf8");
    hash.update(`\0${file}\0${text.replace(/\r\n/g, "\n")}`);
  }
  return hash.digest("hex");
}

if (process.argv[1]?.endsWith("native-fingerprint.ts")) {
  console.log(nativeFingerprint(path.resolve(import.meta.dirname, "..")));
}
