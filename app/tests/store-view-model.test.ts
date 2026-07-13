import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatInstalls,
  storeAgentGlyph,
  storeSlugFromShareUrl,
} from "../src/components/store-view/store-view-model.ts";

describe("storeAgentGlyph", () => {
  it("prefers the listing's emoji icon", () => {
    deepStrictEqual(
      storeAgentGlyph({ name: "Mailer", icon: { kind: "emoji", value: "📬" } }),
      { kind: "emoji", value: "📬" },
    );
  });

  it("falls back to a letter avatar for URL icons and missing icons", () => {
    deepStrictEqual(
      storeAgentGlyph({
        name: "mailer",
        icon: { kind: "url", value: "https://x/y.png" },
      }),
      { kind: "letter", value: "M" },
    );
    deepStrictEqual(storeAgentGlyph({ name: "ágil", icon: null }), {
      kind: "letter",
      value: "Á",
    });
  });

  it("survives an empty name", () => {
    deepStrictEqual(storeAgentGlyph({ name: "  ", icon: null }), {
      kind: "letter",
      value: "?",
    });
  });

  it("takes the first grapheme, not the first UTF-16 unit", () => {
    strictEqual(storeAgentGlyph({ name: "🚀 Launch", icon: null }).value, "🚀");
  });
});

describe("formatInstalls", () => {
  it("passes small counts through", () => {
    strictEqual(formatInstalls(7, "en"), "7");
  });

  it("compacts large counts", () => {
    strictEqual(formatInstalls(1200, "en"), "1.2K");
  });
});

describe("storeSlugFromShareUrl", () => {
  it("extracts the slug from a share URL", () => {
    strictEqual(
      storeSlugFromShareUrl("https://agents.gethouston.ai/a/inbox-helper"),
      "inbox-helper",
    );
  });

  it("tolerates a trailing slash and whitespace", () => {
    strictEqual(
      storeSlugFromShareUrl(" https://agents.gethouston.ai/a/inbox-helper/ "),
      "inbox-helper",
    );
  });

  it("rejects non-share URLs", () => {
    strictEqual(
      storeSlugFromShareUrl("https://agents.gethouston.ai/explore"),
      null,
    );
    strictEqual(storeSlugFromShareUrl("not a url"), null);
    strictEqual(
      storeSlugFromShareUrl("https://agents.gethouston.ai/a/UPPER"),
      null,
    );
  });
});
