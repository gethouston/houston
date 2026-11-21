import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  detectPlatformOs,
  isMacPlatform,
  metricsPlatform,
} from "../src/lib/platform.ts";

describe("isMacPlatform", () => {
  it("detects macOS from navigator.platform", () => {
    strictEqual(isMacPlatform("MacIntel", "Mozilla/5.0 (Macintosh)"), true);
  });

  it("detects macOS from userAgent when platform is empty", () => {
    strictEqual(
      isMacPlatform("", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
      true,
    );
  });

  it("treats Windows as non-mac", () => {
    strictEqual(
      isMacPlatform("Win32", "Mozilla/5.0 (Windows NT 10.0; Win64)"),
      false,
    );
  });

  it("treats Linux as non-mac", () => {
    strictEqual(
      isMacPlatform("Linux x86_64", "Mozilla/5.0 (X11; Linux x86_64)"),
      false,
    );
  });

  it("prefers platform over userAgent (Windows platform wins despite Mac UA)", () => {
    strictEqual(isMacPlatform("Win32", "Mozilla/5.0 (Macintosh)"), false);
  });

  it("falls back safely when navigator fields are missing or empty", () => {
    strictEqual(isMacPlatform(undefined, undefined), false);
    strictEqual(isMacPlatform(null, null), false);
    strictEqual(isMacPlatform("", ""), false);
  });
});

describe("detectPlatformOs", () => {
  it("normalizes macOS", () => {
    strictEqual(
      detectPlatformOs("MacIntel", "Mozilla/5.0 (Macintosh)"),
      "macos",
    );
  });

  it("normalizes Windows", () => {
    strictEqual(
      detectPlatformOs("Win32", "Mozilla/5.0 (Windows NT 10.0; Win64)"),
      "windows",
    );
  });

  it("normalizes Linux", () => {
    strictEqual(
      detectPlatformOs("Linux x86_64", "Mozilla/5.0 (X11; Linux x86_64)"),
      "linux",
    );
  });

  it("falls back to userAgent when platform is empty", () => {
    strictEqual(
      detectPlatformOs("", "Mozilla/5.0 (Windows NT 10.0; Win64)"),
      "windows",
    );
  });

  it("prefers platform over userAgent", () => {
    strictEqual(
      detectPlatformOs("Win32", "Mozilla/5.0 (Macintosh)"),
      "windows",
    );
  });

  it("returns unknown when navigator fields are missing or empty", () => {
    strictEqual(detectPlatformOs(undefined, undefined), "unknown");
    strictEqual(detectPlatformOs(null, null), "unknown");
    strictEqual(detectPlatformOs("", ""), "unknown");
  });
});

describe("metricsPlatform", () => {
  it("labels the desktop shell with its OS", () => {
    strictEqual(metricsPlatform(true, "windows"), "windows");
    strictEqual(metricsPlatform(true, "macos"), "macos");
  });

  it("labels the web app web, whatever OS the browser runs on", () => {
    strictEqual(metricsPlatform(false, "macos"), "web");
    strictEqual(metricsPlatform(false, "unknown"), "web");
  });
});
