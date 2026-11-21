import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  appUpdateChannel,
  formatAppVersionHeader,
} from "../src/lib/app-version.ts";

describe("appUpdateChannel", () => {
  it("reports cloud for a baked hosted gateway (managed-cloud default, oauth)", () => {
    strictEqual(
      appUpdateChannel({ VITE_HOSTED_ENGINE_URL: "https://gw.example" }),
      "cloud",
    );
  });

  it("reports cloud for a hosted gateway with oauth toggled off (static)", () => {
    strictEqual(
      appUpdateChannel({
        VITE_HOSTED_ENGINE_URL: "https://gw.example",
        VITE_HOSTED_ENGINE_AUTH: "static",
      }),
      "cloud",
    );
  });

  it("reports local for the default sidecar build and dev", () => {
    strictEqual(appUpdateChannel({}), "local");
  });

  it("reports local when a dev VITE_NEW_ENGINE_URL wins over the gateway", () => {
    strictEqual(
      appUpdateChannel({
        VITE_NEW_ENGINE_URL: "http://127.0.0.1:8787",
        VITE_HOSTED_ENGINE_URL: "https://gw.example",
      }),
      "local",
    );
  });
});

describe("formatAppVersionHeader", () => {
  it("joins version and channel with the + separator", () => {
    strictEqual(formatAppVersionHeader("0.5.9", "cloud"), "0.5.9+cloud");
    strictEqual(
      formatAppVersionHeader("0.5.9-dev", "local"),
      "0.5.9-dev+local",
    );
  });
});
