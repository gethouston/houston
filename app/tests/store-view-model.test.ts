import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  browseIntegrationOptions,
  catalogIntegrationOptions,
  formatInstalls,
  requestPublicMode,
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

describe("catalogIntegrationOptions", () => {
  it("dedupes and lowercases the toolkit slugs across listings", () => {
    deepStrictEqual(
      catalogIntegrationOptions(
        [
          { integrations: ["GMAIL", "SLACK"] },
          { integrations: ["gmail", "NOTION"] },
        ],
        null,
      ),
      ["gmail", "slack", "notion"],
    );
  });

  it("keeps the active filter's app even when no listing carries it", () => {
    // The zero-result trap: an active integration combined with a search that
    // matches nothing empties the listing union, but the control must stay so
    // the user can clear it.
    deepStrictEqual(catalogIntegrationOptions([], "gmail"), ["gmail"]);
  });

  it("does not duplicate the active app when a listing already carries it", () => {
    deepStrictEqual(
      catalogIntegrationOptions([{ integrations: ["GMAIL"] }], "gmail"),
      ["gmail"],
    );
  });

  it("returns an empty list when no filter is active and nothing loaded", () => {
    deepStrictEqual(catalogIntegrationOptions([], null), []);
  });
});

describe("browseIntegrationOptions", () => {
  it("sources the vocabulary from the grid when no filter is active", () => {
    const grid = [{ integrations: ["GMAIL"] }, { integrations: ["NOTION"] }];
    deepStrictEqual(browseIntegrationOptions(grid, [], null), [
      "gmail",
      "notion",
    ]);
  });

  it("keeps other toolkits offered once a filter collapses the grid", () => {
    // The finding: selecting GMAIL refetches the grid to gmail-only, so a
    // grid-derived vocabulary would drop NOTION and force a round trip through
    // "All integrations". Sourcing from the unfiltered read keeps NOTION.
    const filteredGrid = [{ integrations: ["GMAIL"] }];
    const unfiltered = [
      { integrations: ["GMAIL"] },
      { integrations: ["NOTION"] },
    ];
    deepStrictEqual(
      browseIntegrationOptions(filteredGrid, unfiltered, "gmail"),
      ["gmail", "notion"],
    );
  });

  it("keeps the active toolkit even before the unfiltered read resolves", () => {
    deepStrictEqual(browseIntegrationOptions([], [], "gmail"), ["gmail"]);
  });
});

describe("requestPublicMode", () => {
  const idle = { inFlight: false, requested: false };

  it("hides the control unless the agent is published and not public", () => {
    strictEqual(
      requestPublicMode({ state: "draft", visibility: "unlisted" }, idle),
      "hidden",
    );
    strictEqual(
      requestPublicMode({ state: "published", visibility: "public" }, idle),
      "hidden",
    );
    strictEqual(
      requestPublicMode({ state: "archived", visibility: "unlisted" }, idle),
      "hidden",
    );
  });

  it("offers the request on a published, unlisted agent", () => {
    strictEqual(
      requestPublicMode({ state: "published", visibility: "unlisted" }, idle),
      "available",
    );
  });

  it("shows a pending state while the request is in flight", () => {
    strictEqual(
      requestPublicMode(
        { state: "published", visibility: "unlisted" },
        { inFlight: true, requested: false },
      ),
      "pending",
    );
  });

  it("acknowledges a sent request so the row is not byte-for-byte identical", () => {
    strictEqual(
      requestPublicMode(
        { state: "published", visibility: "unlisted" },
        { inFlight: false, requested: true },
      ),
      "requested",
    );
  });
});
