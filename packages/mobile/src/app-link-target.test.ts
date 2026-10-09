import { expect, test } from "vitest";
import { appLinkTarget } from "./app-link-target";

test("opens only the app's public links", () => {
  expect(appLinkTarget("https://app.gethouston.ai/")).toBe("home");
  expect(
    appLinkTarget("https://app.gethouston.ai/settings/plan?return=1"),
  ).toBe("plan");
  for (const url of [
    "https://app.gethouston.ai/settings/channels",
    "https://evil.test/",
    "http://app.gethouston.ai/",
    "https://app.gethouston.ai:444/",
    "https://app.gethouston.ai.evil.test/",
  ]) {
    expect(appLinkTarget(url)).toBeNull();
  }
});
