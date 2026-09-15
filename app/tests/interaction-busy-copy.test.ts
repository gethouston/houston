import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * PRODUCT-1827 (HOUSTON-APP-5EY): the SDK answers a dismiss raced by a running
 * turn as a typed `turn_running` outcome, and the panel says so in authored
 * copy. The copy must exist in every shipped locale.
 */
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
