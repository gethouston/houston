import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import compat from "../native-compat.json";
import mobilePackage from "../package.json";

// This frozen pair forces a native build bump when the plugin set changes.
// Advance both values only with new iOS/Android native build numbers.
const nativePluginBaseline = {
  build: 2,
  sha256: "9214b1ffafdebe371a58b706ef8d6593e6d40143af59a7d6b6d37e2ec31dbb68",
};

test("native compatibility records the installed Capacitor plugin set", () => {
  const plugins = Object.fromEntries(
    Object.entries(mobilePackage.dependencies)
      .filter(
        ([name]) =>
          name.startsWith("@capacitor/") ||
          name.startsWith("@capacitor-firebase/") ||
          name.startsWith("@capgo/"),
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(plugins))
    .digest("hex");
  expect(compat.plugin_dependencies_sha256).toBe(fingerprint);
  expect(compat.required_native_build).toBe(nativePluginBaseline.build);
  expect(fingerprint).toBe(nativePluginBaseline.sha256);
  expect(compat.required_native_build).toBeGreaterThanOrEqual(
    compat.min_native_build,
  );
  expect(readFileSync("android/app/build.gradle", "utf8")).toContain(
    `versionCode ${compat.required_native_build}`,
  );
  expect(
    readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8"),
  ).toContain(`CURRENT_PROJECT_VERSION = ${compat.required_native_build};`);
});
