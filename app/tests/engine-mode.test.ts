import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  codexUsesLoopbackRelay,
  controlPlaneBuild,
  hostedAuthMode,
  hostedGateState,
  hostedOauthLoginActive,
  providerLoginUsesDeviceAuthByDefault,
  resolveEngine,
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

// Codex/OpenAI (ChatGPT) sign-in uses the desktop's own loopback relay even
// against a remote engine — the desktop binds its localhost listener and relays
// the callback code, so unlike providerLoginUsesDeviceAuthByDefault it does NOT
// fall back to device code just because the engine is remote. A plain browser
// client has no local listener and still can't relay.
describe("codexUsesLoopbackRelay", () => {
  it("uses the loopback relay on the Tauri desktop (even against a remote engine)", () => {
    strictEqual(codexUsesLoopbackRelay({ isTauri: true }), true);
  });

  it("does not use the loopback relay in a plain browser client", () => {
    strictEqual(codexUsesLoopbackRelay({ isTauri: false }), false);
  });
});

// HOU-611: VITE_HOSTED_ENGINE_AUTH is the enable/disable switch for the hosted
// Supabase Google-login gate, so a developer can point the desktop app at a
// hosted gateway (e.g. the local kind cluster) and toggle OAuth on or off
// without changing the URL.
describe("hostedAuthMode (HOU-611)", () => {
  it("defaults to oauth when a hosted URL is set (managed-cloud contract)", () => {
    strictEqual(
      hostedAuthMode({ VITE_HOSTED_ENGINE_URL: "https://cloud.example" }),
      "oauth",
    );
  });

  it("defaults to static with no hosted URL (plain self-host / dev)", () => {
    strictEqual(hostedAuthMode({}), "static");
    strictEqual(
      hostedAuthMode({ VITE_NEW_ENGINE_URL: "https://host.example" }),
      "static",
    );
  });

  it("accepts every truthy spelling as oauth (case/space-insensitive)", () => {
    for (const v of [
      "oauth",
      "supabase",
      "google",
      "1",
      "true",
      "on",
      " OAuth ",
    ]) {
      strictEqual(hostedAuthMode({ VITE_HOSTED_ENGINE_AUTH: v }), "oauth");
    }
  });

  it("accepts every falsy spelling as static, overriding the URL default", () => {
    for (const v of [
      "static",
      "token",
      "none",
      "0",
      "false",
      "off",
      " STATIC ",
    ]) {
      strictEqual(
        hostedAuthMode({
          VITE_HOSTED_ENGINE_URL: "https://cloud.example",
          VITE_HOSTED_ENGINE_AUTH: v,
        }),
        "static",
      );
    }
  });

  it("falls back to the URL default for an unrecognised value", () => {
    strictEqual(
      hostedAuthMode({
        VITE_HOSTED_ENGINE_URL: "https://cloud.example",
        VITE_HOSTED_ENGINE_AUTH: "banana",
      }),
      "oauth",
    );
  });
});

describe("hostedOauthLoginActive (HOU-611)", () => {
  it("is on for a hosted URL with the default (oauth) auth mode", () => {
    strictEqual(
      hostedOauthLoginActive({
        VITE_HOSTED_ENGINE_URL: "https://cloud.example",
      }),
      true,
    );
  });

  it("is off for a hosted URL when auth is toggled to static", () => {
    strictEqual(
      hostedOauthLoginActive({
        VITE_HOSTED_ENGINE_URL: "https://cloud.example",
        VITE_HOSTED_ENGINE_AUTH: "static",
      }),
      false,
    );
  });

  it("is off with no hosted URL even if oauth is requested (nowhere to send the token)", () => {
    strictEqual(
      hostedOauthLoginActive({ VITE_HOSTED_ENGINE_AUTH: "oauth" }),
      false,
    );
    strictEqual(
      hostedOauthLoginActive({ VITE_NEW_ENGINE_URL: "https://host.example" }),
      false,
    );
  });
});

describe("hostedGateState (HOU-611)", () => {
  const base = {
    authConfigured: true,
    sessionLoading: false,
    hasSession: true,
    engineReady: true,
  };

  it("is misconfigured when hosted OAuth lacks a Supabase project (no silent hang)", () => {
    strictEqual(
      hostedGateState({ ...base, authConfigured: false, hasSession: false }),
      "misconfigured",
    );
    // misconfigured wins even mid-load — never spins on the splash forever.
    strictEqual(
      hostedGateState({ ...base, authConfigured: false, sessionLoading: true }),
      "misconfigured",
    );
  });

  it("loads while the session resolves", () => {
    strictEqual(
      hostedGateState({ ...base, sessionLoading: true, hasSession: false }),
      "loading",
    );
  });

  it("prompts sign-in once resolved to no session", () => {
    strictEqual(hostedGateState({ ...base, hasSession: false }), "sign-in");
  });

  it("loads while a fresh token is applied to the engine", () => {
    strictEqual(hostedGateState({ ...base, engineReady: false }), "loading");
  });

  it("is ready when signed in and the engine is bootstrapped", () => {
    strictEqual(hostedGateState(base), "ready");
  });
});

// HOU-621: the runtime local-vs-remote chooser. Build-baked targets win and skip
// the chooser; the chooser only exists in the TS-engine build (VITE_NEW_ENGINE
// truthy, where vite aliases the v3 adapter). A plain Rust build ignores any
// stored choice and stays on its sidecar.
describe("resolveEngine (HOU-621)", () => {
  it("uses the baked static host when VITE_NEW_ENGINE_URL is set", () => {
    deepStrictEqual(
      resolveEngine(
        { VITE_NEW_ENGINE_URL: "https://host.example" },
        null,
        true,
      ),
      { kind: "static-host", url: "https://host.example" },
    );
  });

  it("uses hosted OAuth when a hosted URL is set (managed-cloud default)", () => {
    deepStrictEqual(
      resolveEngine(
        { VITE_HOSTED_ENGINE_URL: "https://cloud.example" },
        null,
        true,
      ),
      { kind: "hosted-oauth", url: "https://cloud.example" },
    );
  });

  it("uses hosted static when the hosted URL has OAuth toggled off", () => {
    deepStrictEqual(
      resolveEngine(
        {
          VITE_HOSTED_ENGINE_URL: "https://cloud.example",
          VITE_HOSTED_ENGINE_AUTH: "static",
        },
        null,
        true,
      ),
      { kind: "hosted-static", url: "https://cloud.example" },
    );
  });

  it("is pending in a TS-engine DESKTOP build with no choice yet (shows the chooser)", () => {
    deepStrictEqual(resolveEngine({ VITE_NEW_ENGINE: "1" }, null, true), {
      kind: "pending",
    });
    deepStrictEqual(resolveEngine({ VITE_NEW_ENGINE: "true" }, null, true), {
      kind: "pending",
    });
  });

  it("uses the sidecar for the runtime `local` choice", () => {
    deepStrictEqual(
      resolveEngine({ VITE_NEW_ENGINE: "1" }, { mode: "local" }, true),
      { kind: "sidecar" },
    );
  });

  it("uses hosted OAuth at the entered URL for the runtime `remote` choice", () => {
    deepStrictEqual(
      resolveEngine(
        { VITE_NEW_ENGINE: "1" },
        { mode: "remote", url: "https://remote.example" },
        true,
      ),
      { kind: "hosted-oauth", url: "https://remote.example" },
    );
  });

  it("never goes pending in a browser (packages/web) TS-engine build", () => {
    // The web build runs VITE_NEW_ENGINE=1 with no baked URL and injects
    // window.__HOUSTON_ENGINE__ itself; a `pending` here would hang the web app
    // and the whole Playwright suite (engine.ts is shared). isTauri=false yields
    // `sidecar` so resolveConfig adopts the injected config.
    deepStrictEqual(resolveEngine({ VITE_NEW_ENGINE: "1" }, null, false), {
      kind: "sidecar",
    });
    deepStrictEqual(
      resolveEngine(
        { VITE_NEW_ENGINE: "1" },
        { mode: "remote", url: "https://remote.example" },
        false,
      ),
      { kind: "sidecar" },
    );
  });

  it("stays on the Rust sidecar for the default build, ignoring any stored choice", () => {
    deepStrictEqual(resolveEngine({}, null, true), { kind: "sidecar" });
    // A stale choice from a prior TS-engine build must NOT be honoured without
    // the v3 adapter alias: there is no v3 client to point at the remote URL.
    deepStrictEqual(
      resolveEngine(
        {},
        { mode: "remote", url: "https://remote.example" },
        true,
      ),
      { kind: "sidecar" },
    );
  });

  it("lets a baked URL win over the runtime chooser (build target is authoritative)", () => {
    deepStrictEqual(
      resolveEngine(
        { VITE_NEW_ENGINE: "1", VITE_NEW_ENGINE_URL: "https://host.example" },
        { mode: "remote", url: "https://remote.example" },
        true,
      ),
      { kind: "static-host", url: "https://host.example" },
    );
    deepStrictEqual(
      resolveEngine(
        {
          VITE_NEW_ENGINE: "1",
          VITE_HOSTED_ENGINE_URL: "https://cloud.example",
        },
        { mode: "remote", url: "https://remote.example" },
        true,
      ),
      { kind: "hosted-oauth", url: "https://cloud.example" },
    );
  });
});
