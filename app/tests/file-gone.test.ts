import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isFileGoneError } from "../src/lib/file-gone.ts";

/**
 * PRODUCT-1780 (HOUSTON-APP-53E): a workspace-file download that answers
 * `404 file not found` is the user's state (the agent linked a file that is
 * not there), never a Houston bug. The classifier keys on the structural
 * status both engine adapters carry; every other status stays loud.
 */
describe("isFileGoneError", () => {
  it("matches the engine-client 404 for a missing workspace file", () => {
    const err = Object.assign(new Error("file not found (engine error 404)"), {
      status: 404,
      body: { error: "file not found" },
    });
    assert.equal(isFileGoneError(err), true);
    assert.equal(isFileGoneError({ status: 404 }), true);
  });

  it("never matches other statuses or shapeless throws", () => {
    for (const status of [400, 403, 500, 502, 503, "404"]) {
      assert.equal(isFileGoneError({ status }), false);
    }
    assert.equal(isFileGoneError(undefined), false);
    assert.equal(isFileGoneError("file not found"), false);
    assert.equal(isFileGoneError(new Error("boom")), false);
  });
});

describe("files.gone copy", () => {
  for (const locale of ["en", "es", "pt"] as const) {
    it(`${locale} has authored title + description`, () => {
      const agents = JSON.parse(
        readFileSync(
          join(import.meta.dirname, `../src/locales/${locale}/agents.json`),
          "utf8",
        ),
      ) as { files?: { gone?: Record<string, unknown> } };
      for (const key of ["title", "description"]) {
        const text = agents.files?.gone?.[key];
        assert.equal(typeof text, "string");
        assert.ok((text as string).length > 0);
        assert.ok(!/engine error|404|—/i.test(text as string));
      }
    });
  }
});
