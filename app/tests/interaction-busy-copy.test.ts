import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

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
      assert.ok(chat.errors.interactionNotYoursTitle.length > 0);
      assert.ok(chat.errors.interactionNotYoursBody.length > 0);
    });
  }
});
