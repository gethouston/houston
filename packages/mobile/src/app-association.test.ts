import { expect, test, vi } from "vitest";
import { associationAssets } from "../../web/src/app-association";

test("associations include only the native link routes", () => {
  const assets = associationAssets({
    HOUSTON_APPLE_TEAM_ID: "TEAM123",
    HOUSTON_ANDROID_CERT_SHA256: "AA:BB, CC:DD",
  });
  expect(
    JSON.parse(assets[".well-known/apple-app-site-association"]).applinks
      .details[0],
  ).toEqual({
    appIDs: ["TEAM123.ai.gethouston.app"],
    components: [{ "/": "/" }, { "/": "/settings/plan" }],
  });
  expect(
    JSON.parse(assets[".well-known/assetlinks.json"])[0].target
      .sha256_cert_fingerprints,
  ).toEqual(["AA:BB", "CC:DD"]);
});

test("missing association values omit files with one named log", () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(associationAssets({})).toEqual({});
  expect(warning).toHaveBeenCalledOnce();
  expect(warning.mock.calls[0][0]).toContain(
    "HOUSTON_APPLE_TEAM_ID, HOUSTON_ANDROID_CERT_SHA256",
  );
  warning.mockRestore();
});
