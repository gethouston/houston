import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  claimProviderLoginSurface,
  providerLoginFallbackAction,
  providerLoginSurfaceClaimed,
} from "../src/components/shell/provider-login-surface.ts";

// HOU-676: a sign-in launched from a surface without its own login handler
// (the in-chat reconnect card) emitted `ProviderLoginUrl` into the void — the
// runtime had started the OAuth flow but nothing opened the browser, so the
// button read as dead. The shell-global fallback acts on the event exactly
// when no dedicated login surface (AI hub, picker, onboarding step) is
// mounted; these tests pin the claim lifecycle and the routing decision.

describe("claimProviderLoginSurface", () => {
  it("claims while held, releases on the returned function, and is idempotent", () => {
    strictEqual(providerLoginSurfaceClaimed(), false);
    const releaseA = claimProviderLoginSurface();
    const releaseB = claimProviderLoginSurface();
    strictEqual(providerLoginSurfaceClaimed(), true);
    releaseA();
    // The other surface still holds a claim.
    strictEqual(providerLoginSurfaceClaimed(), true);
    // Double release (a re-run effect cleanup) must not free B's claim.
    releaseA();
    strictEqual(providerLoginSurfaceClaimed(), true);
    releaseB();
    strictEqual(providerLoginSurfaceClaimed(), false);
  });
});

describe("providerLoginFallbackAction", () => {
  it("stands down whenever a dedicated surface holds the claim", () => {
    strictEqual(
      providerLoginFallbackAction({
        claimed: true,
        isDesktop: true,
        userCode: null,
      }),
      "ignore",
    );
    strictEqual(
      providerLoginFallbackAction({
        claimed: true,
        isDesktop: false,
        userCode: "ABCD-1234",
      }),
      "ignore",
    );
  });

  it("opens the browser directly for the desktop loopback flow (no code to show)", () => {
    strictEqual(
      providerLoginFallbackAction({
        claimed: false,
        isDesktop: true,
        userCode: null,
      }),
      "open",
    );
    strictEqual(
      providerLoginFallbackAction({
        claimed: false,
        isDesktop: true,
        userCode: undefined,
      }),
      "open",
    );
  });

  it("shows the dialog for device-code and web/remote flows", () => {
    // Device code: the user must read the one-time code, browser-open alone
    // would strand them.
    strictEqual(
      providerLoginFallbackAction({
        claimed: false,
        isDesktop: true,
        userCode: "ABCD-1234",
      }),
      "dialog",
    );
    // Web client: popup-blockers eat a non-gesture open; the dialog's button
    // gives the user gesture.
    strictEqual(
      providerLoginFallbackAction({
        claimed: false,
        isDesktop: false,
        userCode: null,
      }),
      "dialog",
    );
  });
});
