import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { canResetPhoneAccess } from "../src/components/settings/sections/connect-phone-state.ts";

describe("canResetPhoneAccess (HOU-443 gating)", () => {
  it("allows reset only when the tunnel is connected", () => {
    strictEqual(canResetPhoneAccess({ connected: true }), true);
  });

  it("blocks reset while the tunnel is still allocating or offline", () => {
    // The exact bug: reset fired before allocation completed (connected:false),
    // surfacing `unavailable: Tunnel allocation hasn't completed yet`.
    strictEqual(canResetPhoneAccess({ connected: false }), false);
  });

  it("blocks reset before status has loaded (no info yet)", () => {
    strictEqual(canResetPhoneAccess(null), false);
  });
});
