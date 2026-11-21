import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import compat from "../native-compat.json";
import {
  lockedNativeVersions,
  nativeFingerprint,
} from "../scripts/native-fingerprint";

const nativeBaselines = [
  {
    min_native_build: 101,
    sha256: "1deda835f890e7ace319f726646be7d8b0330d6650f59e680dc3f20fb1eb5006",
  },
] as const;

test("a native fingerprint change moves the OTA floor past every older build", () => {
  const fingerprint = nativeFingerprint(process.cwd());
  const latest = nativeBaselines.at(-1);
  expect(compat.native_fingerprint_sha256).toBe(fingerprint);
  expect(latest?.sha256).toBe(fingerprint);
  expect(compat.min_native_build).toBe(latest?.min_native_build);
  nativeBaselines.forEach((entry, index) => {
    const attempt = entry.min_native_build % 100;
    expect(entry.min_native_build).toBeGreaterThan(100);
    expect(attempt).toBeGreaterThan(0);
    const previous = nativeBaselines[index - 1];
    if (previous)
      expect(entry.min_native_build).toBeGreaterThan(previous.min_native_build);
  });
  expect(compat.required_native_build).toBeGreaterThanOrEqual(
    compat.min_native_build,
  );
  const local = compat.min_native_build - 1;
  expect(readFileSync("android/app/build.gradle", "utf8")).toContain(
    `System.getenv('HOUSTON_NATIVE_BUILD_NUMBER') ?: '${local}'`,
  );
  expect(
    readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8"),
  ).toContain(`CURRENT_PROJECT_VERSION = ${local};`);
});

test("the fingerprint reads resolved plugin versions, not package.json ranges", () => {
  const lock = [
    "importers:",
    "  packages/mobile:",
    "    dependencies:",
    "      '@capacitor/app':",
    "        specifier: ^8.1.2",
    "        version: 8.1.9(@capacitor/core@8.5.3)",
    "      '@capacitor/core':",
    "        specifier: 8.5.3",
    "        version: 8.5.3",
    "      react:",
    "        specifier: 19.2.7",
    "        version: 19.2.7",
    "  packages/web:",
    "    dependencies:",
    "      '@capgo/capacitor-updater':",
    "        specifier: 1.0.0",
    "        version: 1.0.0",
    "",
  ].join("\n");
  expect(lockedNativeVersions(`lockfileVersion: '9.0'\n${lock}`)).toEqual({
    "@capacitor/app": "8.1.9",
    "@capacitor/core": "8.5.3",
  });
});
