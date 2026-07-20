import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveClientDeployment } from "../src/lib/sentry-deployment.ts";

describe("resolveClientDeployment", () => {
  it("tags a hosted gateway as managed-cloud (desktop cloud build)", () => {
    strictEqual(
      resolveClientDeployment({
        engine: { kind: "hosted-oauth", url: "https://gateway.gethouston.ai" },
      }),
      "managed-cloud",
    );
    strictEqual(
      resolveClientDeployment({
        engine: { kind: "hosted-static", url: "https://gateway.gethouston.ai" },
      }),
      "managed-cloud",
    );
  });

  it("tags the spawned sidecar as desktop", () => {
    strictEqual(
      resolveClientDeployment({ engine: { kind: "sidecar" } }),
      "desktop",
    );
  });

  it("splits an explicit host URL by co-location", () => {
    // The dev two-terminal setup runs a host on loopback — still desktop.
    strictEqual(
      resolveClientDeployment({
        engine: { kind: "static-host", url: "http://127.0.0.1:4318" },
      }),
      "desktop",
    );
    // A real remote host is someone's own deployment.
    strictEqual(
      resolveClientDeployment({
        engine: { kind: "static-host", url: "https://houston.example.com" },
      }),
      "selfhost",
    );
  });

  it("honors the web entry's override", () => {
    strictEqual(
      resolveClientDeployment({
        engine: { kind: "sidecar" },
        override: "managed-cloud",
      }),
      "managed-cloud",
    );
  });

  it("ignores an unrecognized override rather than tagging arbitrary text", () => {
    strictEqual(
      resolveClientDeployment({
        engine: { kind: "hosted-oauth", url: "https://gateway.gethouston.ai" },
        override: "totally-bogus",
      }),
      "managed-cloud",
    );
  });
});
