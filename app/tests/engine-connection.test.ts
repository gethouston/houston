import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { normalizeEngineUrl } from "../src/lib/engine-connection.ts";

// HOU-621: the remote-connection URL the user types on the connection chooser is
// normalized into a base URL the engine client can append `/v1/...` to.
describe("normalizeEngineUrl (HOU-621)", () => {
  it("prepends https:// to a bare host (the engine.example.com case)", () => {
    strictEqual(
      normalizeEngineUrl("engine.example.com"),
      "https://engine.example.com",
    );
  });

  it("keeps an explicit https URL and strips the trailing slash", () => {
    strictEqual(
      normalizeEngineUrl("https://engine.example.com/"),
      "https://engine.example.com",
    );
    strictEqual(
      normalizeEngineUrl("https://engine.example.com///"),
      "https://engine.example.com",
    );
  });

  it("trims whitespace and preserves an explicit path and port", () => {
    strictEqual(
      normalizeEngineUrl("  https://engine.example.com/v1/  "),
      "https://engine.example.com/v1",
    );
    strictEqual(
      normalizeEngineUrl("http://localhost:3000"),
      "http://localhost:3000",
    );
  });

  it("rejects empty / whitespace-only input", () => {
    strictEqual(normalizeEngineUrl(""), null);
    strictEqual(normalizeEngineUrl("   "), null);
  });

  it("rejects non-http(s) schemes and unparseable input", () => {
    strictEqual(normalizeEngineUrl("ftp://example.com"), null);
    strictEqual(normalizeEngineUrl("javascript:alert(1)"), null);
    strictEqual(normalizeEngineUrl("not a url"), null);
  });
});
