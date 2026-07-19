import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  appUpdateChannel,
  emitUpdateRequired,
  formatAppVersionHeader,
  isBelowMinVersion,
  minVersionSignal,
  onUpdateRequired,
} from "../src/lib/update-floor.ts";

// The channel must mirror the release channel exactly: release.yml bakes
// VITE_HOSTED_ENGINE_URL into precisely the cloud-tag builds whose updater is
// repointed at the cloud manifest — so a baked hosted gateway IS the cloud
// channel, and everything else reports local.
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
    // resolveEngine gives the external-host flag precedence; the app then
    // never talks to the gateway, so the cloud channel would be a lie.
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
  it("joins version and channel with the + separator the gateway parses", () => {
    strictEqual(formatAppVersionHeader("0.5.9", "cloud"), "0.5.9+cloud");
    strictEqual(
      formatAppVersionHeader("0.5.9-dev", "local"),
      "0.5.9-dev+local",
    );
  });
});

describe("isBelowMinVersion", () => {
  it("orders by major, minor, patch", () => {
    strictEqual(isBelowMinVersion("0.5.9", "0.6.0"), true);
    strictEqual(isBelowMinVersion("0.5.9", "0.5.10"), true);
    strictEqual(isBelowMinVersion("0.5.9", "1.0.0"), true);
    strictEqual(isBelowMinVersion("0.6.0", "0.5.9"), false);
    strictEqual(isBelowMinVersion("1.0.0", "0.99.99"), false);
    strictEqual(isBelowMinVersion("0.5.9", "0.5.9"), false);
  });

  it("ignores prerelease/build suffixes — a -dev build meeting the floor numerically must not self-block", () => {
    strictEqual(isBelowMinVersion("0.5.9-dev", "0.5.9"), false);
    strictEqual(isBelowMinVersion("0.5.8-dev", "0.5.9"), true);
    strictEqual(isBelowMinVersion("0.5.9+cloud", "0.5.9"), false);
  });

  it("fails open on unparseable input, like the gateway does", () => {
    strictEqual(isBelowMinVersion("garbage", "0.5.9"), false);
    strictEqual(isBelowMinVersion("0.5.9", "garbage"), false);
    strictEqual(isBelowMinVersion("", ""), false);
  });
});

describe("minVersionSignal", () => {
  it("signals when /v1/version names a floor above the running build", () => {
    deepStrictEqual(
      minVersionSignal(
        { engine: "houston-gateway", minAppVersion: "0.6.0" },
        "0.5.9",
      ),
      { minVersion: "0.6.0", updateUrl: null },
    );
  });

  it("is silent when the build meets the floor", () => {
    strictEqual(minVersionSignal({ minAppVersion: "0.5.9" }, "0.5.9"), null);
    strictEqual(minVersionSignal({ minAppVersion: "0.5.0" }, "0.5.9"), null);
  });

  it("is silent when no floor is enforced (field omitted — the dark default)", () => {
    strictEqual(minVersionSignal({ engine: "houston-gateway" }, "0.5.9"), null);
    strictEqual(minVersionSignal(null, "0.5.9"), null);
    strictEqual(minVersionSignal({ minAppVersion: "" }, "0.5.9"), null);
    strictEqual(minVersionSignal({ minAppVersion: 42 }, "0.5.9"), null);
  });
});

// NOTE: the bus latches the last signal across the module's lifetime (a floor
// never un-trips within a process), so these tests run against one shared
// history — each subscribes AFTER the previous emits and asserts the replay.
describe("update-required bus", () => {
  it("delivers to subscribers and honors unsubscribe (nothing latched yet)", () => {
    const seen: unknown[] = [];
    const off = onUpdateRequired((s) => seen.push(s));
    deepStrictEqual(seen, []); // no pre-subscription signal to replay
    emitUpdateRequired({ minVersion: "0.6.0", updateUrl: null });
    off();
    emitUpdateRequired({ minVersion: "0.7.0", updateUrl: "https://dl" });
    deepStrictEqual(seen, [{ minVersion: "0.6.0", updateUrl: null }]);
  });

  it("replays the latched signal to a late subscriber (426 before the shell mounted)", () => {
    const seen: unknown[] = [];
    const off = onUpdateRequired((s) => seen.push(s));
    off();
    deepStrictEqual(seen, [{ minVersion: "0.7.0", updateUrl: "https://dl" }]);
  });

  it("keeps delivering past a throwing listener", () => {
    const seen: string[] = [];
    const offBad = onUpdateRequired(() => {
      throw new Error("boom");
    });
    const offGood = onUpdateRequired((s) => seen.push(s.minVersion ?? ""));
    emitUpdateRequired({ minVersion: "0.8.0", updateUrl: null });
    offBad();
    offGood();
    // One replay of the latched 0.7.0 signal at subscribe, then the live 0.8.0.
    deepStrictEqual(seen, ["0.7.0", "0.8.0"]);
  });
});
