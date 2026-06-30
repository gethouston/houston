import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { toCallbackUrl } from "../src/lib/auth-callback.ts";

// Dev-only sign-in fallback: the `houston://` deep link opens the installed
// production app, so a dev build can't receive the OAuth callback. The user
// pastes the code (or the URL the browser landed on) and this normalizes it for
// the PKCE exchange.
describe("toCallbackUrl (dev sign-in paste)", () => {
  it("returns null for empty / whitespace input", () => {
    strictEqual(toCallbackUrl(""), null);
    strictEqual(toCallbackUrl("   "), null);
  });

  it("passes a full https callback URL through unchanged", () => {
    const u = "https://gethouston.ai/auth/callback/?code=abc-123";
    strictEqual(toCallbackUrl(u), u);
  });

  it("passes a houston:// deep link through unchanged", () => {
    const u = "houston://auth-callback?code=abc-123";
    strictEqual(toCallbackUrl(u), u);
  });

  it("wraps a bare code into a houston:// callback URL", () => {
    strictEqual(
      toCallbackUrl("c686974e-6f9f-4742-aff5-1d30761eeb7a"),
      "houston://auth-callback?code=c686974e-6f9f-4742-aff5-1d30761eeb7a",
    );
  });

  it("extracts the code from a copied query fragment", () => {
    strictEqual(
      toCallbackUrl("code=abc-123&state=xyz"),
      "houston://auth-callback?code=abc-123",
    );
  });

  it("trims surrounding whitespace around a bare code", () => {
    strictEqual(
      toCallbackUrl("  abc-123  "),
      "houston://auth-callback?code=abc-123",
    );
  });

  it("returns null for a query fragment that has no code", () => {
    strictEqual(toCallbackUrl("state=xyz&foo=bar"), null);
  });
});
