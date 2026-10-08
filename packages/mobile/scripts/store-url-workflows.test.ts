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
