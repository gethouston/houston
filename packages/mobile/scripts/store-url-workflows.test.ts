import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const workflow = (name: string) =>
  readFileSync(
    fileURLToPath(
      new URL(`../../../.github/workflows/${name}.yml`, import.meta.url),
    ),
    "utf8",
  );

test("store release skips each platform with one named notice for missing store URLs", () => {
  const source = workflow("mobile-release");
  expect(source).not.toContain('echo "::error::$key is absent"');
  expect(source.match(/missing=\(\)/g)).toHaveLength(2);
  expect(source).toContain(
    "for key in HOUSTON_MOBILE_STORE_URL_IOS VITE_CONTROL_PLANE_URL",
  );
  expect(source).toContain(
    "for key in HOUSTON_MOBILE_STORE_URL_ANDROID VITE_CONTROL_PLANE_URL",
  );
  expect(
    source.match(/::notice::(?:iOS|Android) store upload skipped/g),
  ).toHaveLength(2);
});

test("production OTA publishing permits absent store URLs", () => {
  const source = workflow("mobile-updates");
  expect(source).not.toMatch(
    /test -n "\$HOUSTON_MOBILE_STORE_URL_(?:IOS|ANDROID)"/,
  );
});

test("store uploads name their version after the cloud-v release tag", () => {
  const source = workflow("mobile-release");
  expect(source.match(/version=\$\{tag#cloud-v\}/g)).toHaveLength(2);
  expect(source).not.toContain("git describe");
  expect(source.match(/\| sort -V \| tail -1\)/g)).toHaveLength(2);
  expect(source).toContain('MARKETING_VERSION="$MARKETING_VERSION"');
  expect(source).toContain('export HOUSTON_NATIVE_VERSION_NAME="$version"');
  const gradle = readFileSync(
    fileURLToPath(new URL("../android/app/build.gradle", import.meta.url)),
    "utf8",
  );
  expect(gradle).toContain(
    "versionName(System.getenv('HOUSTON_NATIVE_VERSION_NAME') ?: '1.0')",
  );
});
