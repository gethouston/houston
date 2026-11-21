import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

test("iOS declares camera and microphone use for WebView photo and video capture", () => {
  const plist = read("ios/App/App/Info.plist");
  for (const key of [
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription",
  ])
    expect(plist).toMatch(
      new RegExp(`<key>${key}</key>\\s*<string>[^<]+</string>`),
    );
});

test("Android never backs up WebView storage holding sessions and OTA state", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  expect(manifest).toContain('android:allowBackup="false"');
  expect(manifest).toContain(
    'android:dataExtractionRules="@xml/data_extraction_rules"',
  );
  const rules = read("android/app/src/main/res/xml/data_extraction_rules.xml");
  for (const section of ["cloud-backup", "device-transfer"]) {
    const body = rules.split(`<${section}>`)[1]?.split(`</${section}>`)[0];
    expect(body).toContain('<exclude domain="root" />');
  }
});
