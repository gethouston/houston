// The visitor id the marketing site hands the web app in the link it builds
// (`website/src/assets/houston-analytics.js` → `appLink`). The browser halves —
// `window.location`, `history.replaceState`, `sessionStorage` — are injected,
// so the whole rule is driven here with no DOM.
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  captureWebVisitorId,
  WEB_VISITOR_KEY,
  webVisitorParam,
  withoutWebVisitorParam,
} from "../src/lib/web-visitor-landing.ts";

const VISITOR = "2b0f7a1c-9d3e-4f5a-8b6c-1d2e3f4a5b6c";

function harness(options: { href: string; stored?: string }) {
  const cleaned: string[] = [];
  const store = new Map<string, string>();
  if (options.stored !== undefined) store.set(WEB_VISITOR_KEY, options.stored);
  const captured = captureWebVisitorId({
    href: options.href,
    clean: (url) => cleaned.push(url),
    readStored: () => store.get(WEB_VISITOR_KEY) ?? null,
    writeStored: (id) => store.set(WEB_VISITOR_KEY, id),
  });
  return {
    captured,
    cleaned,
    stored: () => store.get(WEB_VISITOR_KEY) ?? null,
  };
}

describe("the visitor id a marketing link carries", () => {
  it("reads the id the site sent and takes it out of the address bar", () => {
    const h = harness({ href: `https://app.test/?hv=${VISITOR}` });
    strictEqual(h.captured, VISITOR);
    deepStrictEqual(h.cleaned, ["/"]);
    strictEqual(h.stored(), VISITOR, "the tab remembers it across a reload");
  });

  it("leaves the rest of the link alone", () => {
    const h = harness({
      href: `https://app.test/home?settings=channels&hv=${VISITOR}#panel`,
    });
    strictEqual(h.captured, VISITOR);
    deepStrictEqual(h.cleaned, ["/home?settings=channels#panel"]);
  });

  it("stores one shape, whatever case the link used", () => {
    const h = harness({
      href: `https://app.test/?hv=${VISITOR.toUpperCase()}`,
    });
    strictEqual(h.captured, VISITOR);
    strictEqual(h.stored(), VISITOR);
  });

  it("refuses anything that is not a v4 uuid, and still strips it", () => {
    for (const value of [
      "",
      "not-an-id",
      // v1: the gateway stores v4 and refuses the batch over anything else.
      "2b0f7a1c-9d3e-1f5a-8b6c-1d2e3f4a5b6c",
      // Variant nibble outside 8-b.
      "2b0f7a1c-9d3e-4f5a-fb6c-1d2e3f4a5b6c",
      `${VISITOR}x`,
      `${VISITOR}&hv=${VISITOR}`,
    ]) {
      const h = harness({ href: `https://app.test/?hv=${value}` });
      strictEqual(h.captured, null, `accepted ${value}`);
      strictEqual(h.stored(), null, "a mangled id is never remembered");
      deepStrictEqual(h.cleaned, ["/"], "and never left in the address bar");
    }
  });

  it("carries no id for a visit that did not come from the site", () => {
    // What a Do Not Track visitor's link looks like: `appLink` appends nothing
    // when there is no id, so the app simply has none.
    const h = harness({ href: "https://app.test/home?utm_source=x" });
    strictEqual(h.captured, null);
    strictEqual(h.stored(), null);
    deepStrictEqual(h.cleaned, [], "an untouched URL is not rewritten");
  });

  it("keeps the id through a reload, once the link is gone", () => {
    const h = harness({ href: "https://app.test/home", stored: VISITOR });
    strictEqual(h.captured, VISITOR);
    deepStrictEqual(h.cleaned, []);
  });

  it("keeps what the tab captured over a link that was rewritten since", () => {
    const h = harness({
      href: "https://app.test/?hv=garbage",
      stored: VISITOR,
    });
    strictEqual(h.captured, VISITOR);
    deepStrictEqual(h.cleaned, ["/"]);
  });

  it("ignores a stored value that is not an id", () => {
    // Another tenant of the same origin, or a hand-edited entry.
    const h = harness({ href: "https://app.test/", stored: "tampered" });
    strictEqual(h.captured, null);
  });
});

describe("the parts of the link", () => {
  it("reads exactly one parameter", () => {
    strictEqual(webVisitorParam(`?hv=${VISITOR}`), VISITOR);
    strictEqual(webVisitorParam(`?hv=${VISITOR}&hv=${VISITOR}`), null);
    strictEqual(webVisitorParam(""), null);
  });

  it("gives back a relative URL, so nothing navigates off-origin", () => {
    const stripped = withoutWebVisitorParam(
      `https://app.test/a/b?hv=${VISITOR}&x=1`,
    );
    strictEqual(stripped, "/a/b?x=1");
    ok(!stripped.includes("app.test"));
  });
});
