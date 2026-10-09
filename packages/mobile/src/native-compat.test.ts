import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import compat from "../native-compat.json";
import mobilePackage from "../package.json";

// This frozen pair forces a native build bump when the plugin set changes.
// Advance both values only with new iOS/Android native build numbers.
const nativePluginBaseline = {
  build: 4,
  sha256: "5d02dd44118e0f7e64e71aa2c3b26698f62e1219319f68063ff15f39f47bfe98",
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
    `System.getenv('HOUSTON_NATIVE_BUILD_NUMBER') ?: '${compat.required_native_build}'`,
  );
  expect(
    readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8"),
  ).toContain(`CURRENT_PROJECT_VERSION = ${compat.required_native_build};`);
});
