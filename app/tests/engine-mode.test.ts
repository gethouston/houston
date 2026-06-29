import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  controlPlaneBuild,
  providerLoginUsesDeviceAuthByDefault,
} from "../src/lib/engine-mode.ts";

// HOU-546: the control-plane adapter reads window.__HOUSTON_CP__ at construction.
// engine.ts derives that flag from this predicate, so it MUST stay in lockstep
// with `useHost` in app/vite.config.ts (the alias condition). The desktop
// host-sidecar dev loop runs with VITE_NEW_ENGINE=1 and NO url, which is exactly
// the case the original `HOST_URL`-only check missed -> the regression guard.
describe("controlPlaneBuild (HOU-546)", () => {
  it("is on for the desktop host-sidecar loop (VITE_NEW_ENGINE=1, no url)", () => {
    strictEqual(controlPlaneBuild({ VITE_NEW_ENGINE: "1" }), true);
  });

  it("accepts VITE_NEW_ENGINE=true as well", () => {
    strictEqual(controlPlaneBuild({ VITE_NEW_ENGINE: "true" }), true);
  });

  it("is on when only VITE_NEW_ENGINE_URL is set (self-host / external host)", () => {
    strictEqual(
      controlPlaneBuild({ VITE_NEW_ENGINE_URL: "https://host.example" }),
      true,
    );
  });

  it("is on when only VITE_HOSTED_ENGINE_URL is set (managed hosted gateway)", () => {
    strictEqual(
      controlPlaneBuild({ VITE_HOSTED_ENGINE_URL: "https://cloud.example" }),
      true,
    );
  });

  it("is on when both the flag and the url are set", () => {
    strictEqual(
      controlPlaneBuild({
        VITE_NEW_ENGINE: "1",
        VITE_NEW_ENGINE_URL: "https://host.example",
      }),
      true,
    );
  });

  it("is off for the default Rust-engine build (no flags)", () => {
    strictEqual(controlPlaneBuild({}), false);
  });

  it("is off for a non-truthy VITE_NEW_ENGINE value", () => {
    strictEqual(controlPlaneBuild({ VITE_NEW_ENGINE: "0" }), false);
    strictEqual(controlPlaneBuild({ VITE_NEW_ENGINE: "" }), false);
  });
});

// Provider OAuth loopback only works when the desktop app and runtime are on the
// same machine. A Tauri desktop pointed at a self-host / managed host must use
// Codex's device-code flow, otherwise the browser opens against a callback on
// the remote host and the login strands.
describe("providerLoginUsesDeviceAuthByDefault", () => {
  it("uses browser loopback for the default co-located desktop engine", () => {
    strictEqual(
      providerLoginUsesDeviceAuthByDefault({}, { isTauri: true }),
      false,
    );
  });

  it("uses browser loopback for the bundled host sidecar desktop path", () => {
    strictEqual(
      providerLoginUsesDeviceAuthByDefault(
        { VITE_NEW_ENGINE_URL: undefined, VITE_HOSTED_ENGINE_URL: undefined },
        { isTauri: true },
      ),
      false,
    );
  });

  it("uses device code for a desktop app pointed at an external host", () => {
    strictEqual(
      providerLoginUsesDeviceAuthByDefault(
        { VITE_NEW_ENGINE_URL: "https://houston.example.com/engine" },
        { isTauri: true },
      ),
      true,
    );
  });

  it("uses device code for a desktop app pointed at the hosted gateway", () => {
    strictEqual(
      providerLoginUsesDeviceAuthByDefault(
        { VITE_HOSTED_ENGINE_URL: "https://cloud.example" },
        { isTauri: true },
      ),
      true,
    );
  });

  it("uses device code for browser clients", () => {
    strictEqual(
      providerLoginUsesDeviceAuthByDefault({}, { isTauri: false }),
      true,
    );
  });
});
