import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  codexUsesLoopbackRelay,
  controlPlaneBuild,
  hostedAuthMode,
  hostedGateState,
  hostedOauthLoginActive,
  isLoopbackHostUrl,
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

// The app-side Codex loopback relay is GONE: pi binds the provider's fixed
// localhost callback port in-process and completes the exchange itself, so the
// client's only job is opening the URL. What matters is co-location — and a
// LOOPBACK VITE_NEW_ENGINE_URL (the dev two-terminal setup) IS co-located.
describe("isLoopbackHostUrl + the co-located dev URL case", () => {
  it("recognizes this machine's addresses", () => {
    strictEqual(isLoopbackHostUrl("http://127.0.0.1:4318"), true);
    strictEqual(isLoopbackHostUrl("http://localhost:4318"), true);
    strictEqual(isLoopbackHostUrl("http://[::1]:4318"), true);
  });

  it("rejects real hosts, garbage, and absence", () => {
    strictEqual(isLoopbackHostUrl("https://engine.example.com"), false);
    strictEqual(isLoopbackHostUrl("not a url"), false);
    strictEqual(isLoopbackHostUrl(undefined), false);
    strictEqual(isLoopbackHostUrl(""), false);
  });

  it("a loopback VITE_NEW_ENGINE_URL keeps the browser flow (co-located)", () => {
    strictEqual(
      providerLoginUsesDeviceAuthByDefault(
        { VITE_NEW_ENGINE_URL: "http://127.0.0.1:4318" },
        { isTauri: true },
      ),
      false,
    );
  });
});

// The desktop Codex/OpenAI loopback relay is re-introduced but gated to the
// REMOTE-engine cases ONLY. When the engine is CO-LOCATED, pi binds 1455
// in-process on THIS machine — an app-side bind would lose the race (the #615
// collision, reverted in #620). Relay ON is therefore exactly the set where
// topology would otherwise force device-code, and OFF for every co-located /
// web case. The two OFF cases below are the regression guard proving the #620
// collision cannot recur.
describe("codexUsesLoopbackRelay (B2 truth table)", () => {
  it("relay OFF for the local sidecar desktop (tauri, no URLs — pi owns 1455)", () => {
    strictEqual(codexUsesLoopbackRelay({}, { isTauri: true }), false);
  });

  it("relay OFF for a loopback VITE_NEW_ENGINE_URL (co-located dev — pi owns 1455)", () => {
    strictEqual(
      codexUsesLoopbackRelay(
        { VITE_NEW_ENGINE_URL: "http://127.0.0.1:4318" },
        { isTauri: true },
      ),
      false,
    );
  });

  it("relay ON for the hosted gateway (remote — pi's 1455 is in the pod)", () => {
    strictEqual(
      codexUsesLoopbackRelay(
        { VITE_HOSTED_ENGINE_URL: "https://cloud.example" },
        { isTauri: true },
      ),
      true,
    );
  });

  it("relay ON for a non-loopback VITE_NEW_ENGINE_URL (remote host)", () => {
    strictEqual(
      codexUsesLoopbackRelay(
        { VITE_NEW_ENGINE_URL: "https://houston.example.com/engine" },
        { isTauri: true },
      ),
      true,
    );
  });

  it("relay OFF for a web client (can't bind a local port — device-code)", () => {
    strictEqual(
      codexUsesLoopbackRelay(
        { VITE_HOSTED_ENGINE_URL: "https://cloud.example" },
        { isTauri: false },
      ),
      false,
    );
    strictEqual(codexUsesLoopbackRelay({}, { isTauri: false }), false);
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

// HOU-642: the gateway URL is baked into the build — there is no runtime
// chooser. A build-baked target (host URL or hosted gateway) wins; everything
// else runs against its co-located sidecar / injected config.
describe("resolveEngine (HOU-642)", () => {
  it("uses the baked static host when VITE_NEW_ENGINE_URL is set", () => {
    deepStrictEqual(
      resolveEngine({ VITE_NEW_ENGINE_URL: "https://host.example" }),
      {
        kind: "static-host",
        url: "https://host.example",
      },
    );
  });

  it("uses hosted OAuth when a hosted URL is set (managed-cloud default)", () => {
    deepStrictEqual(
      resolveEngine({ VITE_HOSTED_ENGINE_URL: "https://cloud.example" }),
      { kind: "hosted-oauth", url: "https://cloud.example" },
    );
  });

  it("uses hosted static when the hosted URL has OAuth toggled off", () => {
    deepStrictEqual(
      resolveEngine({
        VITE_HOSTED_ENGINE_URL: "https://cloud.example",
        VITE_HOSTED_ENGINE_AUTH: "static",
      }),
      { kind: "hosted-static", url: "https://cloud.example" },
    );
  });

  it("uses the sidecar for the TS-engine build with no baked URL (dev loop + packages/web)", () => {
    deepStrictEqual(resolveEngine({ VITE_NEW_ENGINE: "1" }), {
      kind: "sidecar",
    });
    deepStrictEqual(resolveEngine({ VITE_NEW_ENGINE: "true" }), {
      kind: "sidecar",
    });
  });

  it("uses the sidecar for the default Rust build (no flags)", () => {
    deepStrictEqual(resolveEngine({}), { kind: "sidecar" });
  });

  it("lets VITE_NEW_ENGINE_URL win over the hosted URL (static host is authoritative)", () => {
    deepStrictEqual(
      resolveEngine({
        VITE_NEW_ENGINE_URL: "https://host.example",
        VITE_HOSTED_ENGINE_URL: "https://cloud.example",
      }),
      { kind: "static-host", url: "https://host.example" },
    );
  });
});
