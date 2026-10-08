import { expect, test } from "vitest";
import { withGoogleUrlScheme } from "./sync-google-url-scheme";

const info = "<plist><dict>\n</dict></plist>";
const firebase =
  "<key>REVERSED_CLIENT_ID</key><string>com.googleusercontent.apps.123</string>";

test("sync adds the iOS Google callback once and refreshes it from Firebase", () => {
  const first = withGoogleUrlScheme(info, firebase);
  expect(first).toContain("com.googleusercontent.apps.123");
  expect(withGoogleUrlScheme(first, firebase)).toBe(first);
  const changed = withGoogleUrlScheme(first, firebase.replace("123", "456"));
  expect(changed).toContain("com.googleusercontent.apps.456");
  expect(changed).not.toContain("com.googleusercontent.apps.123");
});

test("sync refuses an invalid Firebase client ID", () => {
  expect(() => withGoogleUrlScheme(info, "<plist/>")).toThrow(
    /REVERSED_CLIENT_ID/,
  );
});
