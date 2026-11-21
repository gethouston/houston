import "./support/dom-env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PerfSpans } from "../src/lib/perf-spans.ts";

const {
  act,
  createElement: h,
  Fragment,
  useLayoutEffect,
} = await import("react");
const { createRoot } = await import("react-dom/client");
const { useSpanOrgSync } = await import("../src/hooks/use-span-org-sync.ts");

const spans = new PerfSpans({ t0Ms: 0, now: () => 0 });
const seenBySiblingLayout: Array<string | null> = [];

function Sync({ slug }: { slug: string | null }) {
  useSpanOrgSync(slug, spans);
  return null;
}

function Probe({ slug }: { slug: string | null }) {
  useLayoutEffect(() => {
    seenBySiblingLayout.push(spans.orgSlugAt(0));
  }, [slug]);
  return null;
}

const host = document.createElement("div");
const root = createRoot(host);
const render = (slug: string | null) =>
  act(() =>
    root.render(h(Fragment, null, h(Sync, { slug }), h(Probe, { slug }))),
  );

describe("useSpanOrgSync", () => {
  it("moves the spans to the new org within the switch's own commit", async () => {
    await render("5f2b225f316c6079");
    await render("383369a239383fee");
    assert.deepEqual(seenBySiblingLayout, [
      "5f2b225f316c6079",
      "383369a239383fee",
    ]);
  });

  it("clears the org when the app unmounts (sign-out remounts it)", async () => {
    await render("5f2b225f316c6079");
    await act(() => root.unmount());
    assert.equal(spans.orgSlugAt(0), null);
  });
});
