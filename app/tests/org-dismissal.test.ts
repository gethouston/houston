import "./support/dom-env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { act, createElement: h } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useOrgDismissal } = await import(
  "../src/components/shell/use-org-dismissal.ts"
);

let dismiss: () => void = () => {};

function Harness({ orgSlug }: { orgSlug: string | null }) {
  const [dismissed, onDismiss] = useOrgDismissal(orgSlug);
  dismiss = onDismiss;
  return h("div", { "data-dismissed": String(dismissed) });
}

const host = document.createElement("div");
const root = createRoot(host);
const render = (orgSlug: string | null) =>
  act(() => root.render(h(Harness, { orgSlug })));
const dismissed = () =>
  host.querySelector("[data-dismissed]")?.getAttribute("data-dismissed");

describe("useOrgDismissal", () => {
  it("holds a dismissal for its org, and asks again in another", async () => {
    await render("00000000000000aa");
    assert.equal(dismissed(), "false");
    await act(() => dismiss());
    assert.equal(dismissed(), "true");
    await render("00000000000000bb");
    assert.equal(dismissed(), "false");
    await act(() => dismiss());
    await render("00000000000000aa");
    assert.equal(dismissed(), "true");
    await render("00000000000000bb");
    assert.equal(dismissed(), "true");
  });
});
