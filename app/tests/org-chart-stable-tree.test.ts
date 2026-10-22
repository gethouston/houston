// An identical reload keeps the tree's identity, so the share image is not
// drawn again for a chart that did not change. Hook mounted in jsdom.

import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import "./support/dom-env.ts";

const React = await import("react");
const { act, createElement: h } = React;
(globalThis as Record<string, unknown>).React = React;
const { createRoot } = await import("react-dom/client");
const { useStableByContent } = await import(
  "../src/components/organization/use-stable-by-content.ts"
);
const { buildOrgTree, SCREEN_TREE_CAPS } = await import(
  "../src/components/organization/org-chart-tree.ts"
);

const tree = (name = "Acme") =>
  buildOrgTree(
    {
      unnamedAccount: "Unnamed account",
      agents: [],
      members: [],
      name,
      personal: false,
    },
    SCREEN_TREE_CAPS,
  );

async function mount(render: () => ReturnType<typeof h>) {
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(render()));
  return root;
}

describe("useStableByContent", () => {
  it("keeps the same object for a fresh but identical tree, and swaps on a change", async () => {
    const seen: unknown[] = [];
    function Probe({ value }: { value: unknown }) {
      seen.push(useStableByContent(value));
      return null;
    }
    const first = tree();
    const root = await mount(() => h(Probe, { value: first }));
    await act(async () => root.render(h(Probe, { value: tree() })));
    strictEqual(seen[1], first);
    const renamed = tree("Renamed");
    await act(async () => root.render(h(Probe, { value: renamed })));
    strictEqual(seen[2], renamed);
    await act(async () => root.unmount());
  });
});
