import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// HOU-721: the red error toast body is `errorToast.genericDescription` (or a
// caller's authored copy), never the raw engine/transport message. If this key
// goes missing in any locale, i18next would render the bare key to every user
// whose action fails — guard its presence and shape here.
const LOCALES = ["en", "es", "pt"] as const;

describe("errorToast locale shape", () => {
  for (const locale of LOCALES) {
    it(`${locale} has a usable errorToast.genericDescription`, () => {
      const shell = JSON.parse(
        readFileSync(
          join(import.meta.dirname, `../src/locales/${locale}/shell.json`),
          "utf8",
        ),
      ) as { errorToast?: Record<string, unknown> };
      const value = shell.errorToast?.genericDescription;
      strictEqual(typeof value, "string");
      const text = value as string;
      ok(text.length > 0, "must not be empty");
      ok(!text.includes("—"), "no em dashes in user-facing copy");
      // The whole point: the body must be authored copy, not a raw diagnostic.
      ok(!/engine error|fetch|http|\{/i.test(text));
    });
  }
});
