import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  devNoSendToastSpec,
  sentrySendInDevEnabled,
} from "../src/lib/sentry-dev.ts";

// Pins the dev-mode Sentry opt-in parser. Default (unset/empty) MUST stay
// false so dev builds never pollute the prod Sentry project; only an explicit
// truthy flag flips it on.

describe("sentrySendInDevEnabled", () => {
  it("is off by default (unset / empty / whitespace)", () => {
    assert.equal(sentrySendInDevEnabled(undefined), false);
    assert.equal(sentrySendInDevEnabled(""), false);
    assert.equal(sentrySendInDevEnabled("   "), false);
  });

  it("accepts the documented truthy values, case- and whitespace-insensitive", () => {
    for (const v of ["1", "true", "yes", "on", "TRUE", " On ", "Yes"]) {
      assert.equal(sentrySendInDevEnabled(v), true, `expected ${v} → true`);
    }
  });

  it("treats other values as off (no accidental opt-in)", () => {
    for (const v of ["0", "false", "no", "off", "2", "enable", "y"]) {
      assert.equal(sentrySendInDevEnabled(v), false, `expected ${v} → false`);
    }
  });
});

describe("devNoSendToastSpec", () => {
  it("is an info toast carrying the SENTRY_SEND_IN_DEV hint", () => {
    const toast = devNoSendToastSpec();
    assert.equal(toast.variant, "info");
    assert.ok(toast.title.length > 0);
    assert.ok(
      toast.description.includes("SENTRY_SEND_IN_DEV"),
      "description must tell the dev which flag to set",
    );
  });

  it("uses no em dash and stays plain ASCII English (dev-only copy)", () => {
    const toast = devNoSendToastSpec();
    for (const s of [toast.title, toast.description]) {
      assert.ok(!s.includes("—"), "no em dash in copy");
      assert.ok(/^[\x20-\x7E]*$/.test(s), `expected ASCII-only copy: ${s}`);
    }
  });
});
