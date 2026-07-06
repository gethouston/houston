import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  providerLoginUrlHost,
  shouldOpenLoginUrlDirectly,
  shouldUseCodexLoopback,
} from "../src/components/shell/provider-login-url.ts";

describe("providerLoginUrlHost", () => {
  it("returns the bare hostname for a normal https URL", () => {
    strictEqual(
      providerLoginUrlHost("https://claude.ai/oauth/authorize"),
      "claude.ai",
    );
  });

  it("drops the path, query, and fragment of a long OAuth URL", () => {
    const url =
      "https://auth.openai.com/authorize?client_id=abc123&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fcallback&scope=openid+profile+email&state=verylongopaquestatevalue#frag";
    strictEqual(providerLoginUrlHost(url), "auth.openai.com");
  });

  it("strips a leading www.", () => {
    strictEqual(
      providerLoginUrlHost("https://www.example.com/path"),
      "example.com",
    );
  });

  it("drops an explicit port", () => {
    strictEqual(
      providerLoginUrlHost("https://console.anthropic.com:8443/x"),
      "console.anthropic.com",
    );
  });

  it("accepts http as well as https", () => {
    strictEqual(providerLoginUrlHost("http://localhost/callback"), "localhost");
  });

  it("returns null for a non-http(s) scheme", () => {
    strictEqual(providerLoginUrlHost("file:///etc/passwd"), null);
    strictEqual(providerLoginUrlHost("javascript:alert(1)"), null);
  });

  it("returns null for an unparseable string", () => {
    strictEqual(providerLoginUrlHost("not a url"), null);
    strictEqual(providerLoginUrlHost("claude.ai/oauth"), null);
  });

  it("returns null for empty or whitespace input", () => {
    strictEqual(providerLoginUrlHost(""), null);
    strictEqual(providerLoginUrlHost("   "), null);
  });

  it("tolerates surrounding whitespace around a valid URL", () => {
    strictEqual(
      providerLoginUrlHost("  https://claude.ai/oauth  "),
      "claude.ai",
    );
  });
});

describe("shouldOpenLoginUrlDirectly", () => {
  it("opens the browser directly on desktop for a loopback flow (no device code)", () => {
    strictEqual(
      shouldOpenLoginUrlDirectly({ isDesktop: true, userCode: null }),
      true,
    );
    strictEqual(
      shouldOpenLoginUrlDirectly({ isDesktop: true, userCode: undefined }),
      true,
    );
  });

  it("keeps the dialog on desktop when a device code must be shown", () => {
    strictEqual(
      shouldOpenLoginUrlDirectly({ isDesktop: true, userCode: "WXYZ-1234" }),
      false,
    );
  });

  it("keeps the dialog for remote / headless web clients", () => {
    strictEqual(
      shouldOpenLoginUrlDirectly({ isDesktop: false, userCode: null }),
      false,
    );
    strictEqual(
      shouldOpenLoginUrlDirectly({ isDesktop: false, userCode: "WXYZ-1234" }),
      false,
    );
  });

  it("treats an empty user code as no code", () => {
    strictEqual(
      shouldOpenLoginUrlDirectly({ isDesktop: true, userCode: "" }),
      true,
    );
  });

  it("keeps the dialog for the Claude/Anthropic setup-token paste flow (auth_code) — its url is docs, not a sign-in page", () => {
    // Desktop must NOT auto-open the docs URL: the user needs the paste dialog.
    strictEqual(
      shouldOpenLoginUrlDirectly({
        isDesktop: true,
        userCode: null,
        authCode: true,
      }),
      false,
    );
    // Web behaves the same (it always dialogs anyway).
    strictEqual(
      shouldOpenLoginUrlDirectly({
        isDesktop: false,
        userCode: null,
        authCode: true,
      }),
      false,
    );
  });

  it("still opens directly on desktop for a loopback flow that is explicitly not auth_code", () => {
    strictEqual(
      shouldOpenLoginUrlDirectly({
        isDesktop: true,
        userCode: null,
        authCode: false,
      }),
      true,
    );
  });
});

// The Codex loopback relay drives ChatGPT sign-in for openai on a Tauri desktop
// ONLY when the engine is remote (pi's 1455 is in the pod, so a local bind can't
// collide). Co-located desktop, a pending device code, a non-openai provider,
// and web clients all stay on their existing paths.
describe("shouldUseCodexLoopback", () => {
  const hosted = { VITE_HOSTED_ENGINE_URL: "https://cloud.example" };
  const remoteHost = { VITE_NEW_ENGINE_URL: "https://houston.example.com" };
  const loopbackDev = { VITE_NEW_ENGINE_URL: "http://127.0.0.1:4318" };

  it("drives the relay for openai on a remote-engine desktop with no device code", () => {
    for (const env of [hosted, remoteHost]) {
      strictEqual(
        shouldUseCodexLoopback({
          provider: "openai",
          env,
          isTauri: true,
          userCode: null,
        }),
        true,
      );
      strictEqual(
        shouldUseCodexLoopback({
          provider: "openai",
          env,
          isTauri: true,
          userCode: undefined,
        }),
        true,
      );
      strictEqual(
        shouldUseCodexLoopback({
          provider: "openai",
          env,
          isTauri: true,
          userCode: "",
        }),
        true,
      );
    }
  });

  it("does NOT relay for a co-located desktop (local sidecar / loopback dev URL)", () => {
    strictEqual(
      shouldUseCodexLoopback({
        provider: "openai",
        env: {},
        isTauri: true,
        userCode: null,
      }),
      false,
    );
    strictEqual(
      shouldUseCodexLoopback({
        provider: "openai",
        env: loopbackDev,
        isTauri: true,
        userCode: null,
      }),
      false,
    );
  });

  it("does not relay when a device code must be shown", () => {
    strictEqual(
      shouldUseCodexLoopback({
        provider: "openai",
        env: hosted,
        isTauri: true,
        userCode: "WXYZ-1234",
      }),
      false,
    );
  });

  it("does not relay for a web / non-desktop client", () => {
    strictEqual(
      shouldUseCodexLoopback({
        provider: "openai",
        env: hosted,
        isTauri: false,
        userCode: null,
      }),
      false,
    );
  });

  it("does not relay for a non-Codex provider (e.g. Claude)", () => {
    strictEqual(
      shouldUseCodexLoopback({
        provider: "anthropic",
        env: hosted,
        isTauri: true,
        userCode: null,
      }),
      false,
    );
  });
});
