import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  claimProviderLoginSurface,
  providerLoginFallbackAction,
  providerLoginSurfaceClaimed,
} from "../src/components/shell/provider-login-surface.ts";

describe("claimProviderLoginSurface", () => {
  it("claims while held, releases on the returned function, and is idempotent", () => {
    strictEqual(providerLoginSurfaceClaimed(), false);
    const releaseA = claimProviderLoginSurface();
    const releaseB = claimProviderLoginSurface();
    strictEqual(providerLoginSurfaceClaimed(), true);
    releaseA();
    strictEqual(providerLoginSurfaceClaimed(), true);
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
    strictEqual(
      providerLoginFallbackAction({
        claimed: false,
        isDesktop: true,
        userCode: "ABCD-1234",
      }),
      "dialog",
    );
    strictEqual(
      providerLoginFallbackAction({
        claimed: false,
        isDesktop: false,
        userCode: null,
      }),
      "dialog",
    );
  });

  it("shows the dialog for the Claude/Anthropic setup-token paste flow (auth_code), even on desktop", () => {
    strictEqual(
      providerLoginFallbackAction({
        claimed: false,
        isDesktop: true,
        userCode: null,
        authCode: true,
      }),
      "dialog",
    );
  });
});
