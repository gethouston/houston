import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isTurnRunningError } from "../src/lib/interaction-busy.ts";

/**
 * PRODUCT-1827 (HOUSTON-APP-5EY): the runtime refuses a pending-interaction
 * dismiss with `409 turn running` when a turn raced the click. That is the
 * user's state (a stale card), never a Houston bug. The classifier keys on
 * the structural status both engine adapters carry; every other status stays
 * loud.
 */
describe("isTurnRunningError", () => {
  it("matches the runtime-client 409 for a busy conversation", () => {
    const err = Object.assign(
      new Error('engine request failed (409): {"error":"turn running"}'),
      { status: 409, body: '{"error":"turn running"}' },
    );
    assert.equal(isTurnRunningError(err), true);
    assert.equal(isTurnRunningError({ status: 409 }), true);
  });

  it("never matches other statuses or shapeless throws", () => {
    for (const status of [400, 403, 404, 500, 502, 503, "409"]) {
      assert.equal(isTurnRunningError({ status }), false);
    }
    assert.equal(isTurnRunningError(undefined), false);
    assert.equal(isTurnRunningError("turn running"), false);
    assert.equal(isTurnRunningError(new Error("boom")), false);
  });
});

describe("chat:errors.interactionBusy copy", () => {
  for (const locale of ["en", "es", "pt"] as const) {
    it(`${locale} has authored title + body`, () => {
      const chat = JSON.parse(
        readFileSync(
          join(import.meta.dirname, `../src/locales/${locale}/chat.json`),
          "utf8",
        ),
      ) as { errors: Record<string, string> };
      assert.ok(chat.errors.interactionBusyTitle.length > 0);
      assert.ok(chat.errors.interactionBusyBody.length > 0);
    });
  }
});
