import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { identityChanged } from "../src/lib/identity-change.ts";

// HOU-903: the pure decision behind the sign-out / account-switch cache wipe.
// Signing in as account B in the same app session used to render account A's
// cached world; the reset must run on a real identity replacement, never on a
// same-user token refresh or the first sign-in (nothing is cached yet).

describe("identityChanged", () => {
  it("resets on an account switch (different uid)", () => {
    strictEqual(identityChanged("user-a", "user-b"), true);
  });

  it("resets on sign-out (user → null)", () => {
    strictEqual(identityChanged("user-a", null), true);
  });

  it("does NOT reset on a token refresh of the same user", () => {
    strictEqual(identityChanged("user-a", "user-a"), false);
  });

  it("does NOT reset on the first sign-in / boot restore (null → user)", () => {
    strictEqual(identityChanged(null, "user-b"), false);
  });

  it("does NOT reset when there was and is no identity (null → null)", () => {
    strictEqual(identityChanged(null, null), false);
  });
});
