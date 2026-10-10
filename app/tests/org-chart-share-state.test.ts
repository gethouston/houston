// The share dialog's state across re-renders: the image is only ever the one
// drawn for this tree while open, an identical reload keeps the tree's
// identity, and an edited post survives a tree change until the dialog is
// closed and opened again. Hooks mounted in jsdom.

import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import "./support/dom-env.ts";

const React = await import("react");
const { act, createElement: h } = React;
(globalThis as Record<string, unknown>).React = React;
const { createRoot } = await import("react-dom/client");
const { currentShareImage } = await import(
  "../src/components/organization/org-chart-share-image-state.ts"
);
const { useSeedOnOpen } = await import(
  "../src/components/organization/use-seed-on-open.ts"
);
const { useStableByContent } = await import(
  "../src/components/organization/use-stable-by-content.ts"
);
const { buildOrgTree, SCREEN_TREE_CAPS } = await import(
  "../src/components/organization/org-chart-tree.ts"
);

const tree = (name = "Acme") =>
  buildOrgTree(
    { agents: [], members: [], name, personal: false },
    SCREEN_TREE_CAPS,
  );

describe("currentShareImage", () => {
  const blob = new Blob(["x"]);
  const ready = {
    status: "ready" as const,
    blob,
    url: "blob:x",
    file: new File([blob], "x.png"),
  };

  it("shows a draw only for its own tree and attempt, while open", () => {
    const a = tree();
    const drawn = { tree: a, attempt: 0, image: ready };
    strictEqual(currentShareImage(drawn, a, 0, true), ready);
    strictEqual(currentShareImage(drawn, a, 0, false).status, "drawing");
    strictEqual(
      currentShareImage(drawn, tree("Other"), 0, true).status,
      "drawing",
    );
    strictEqual(currentShareImage(drawn, a, 1, true).status, "drawing");
    strictEqual(currentShareImage(null, a, 0, true).status, "drawing");
  });
});

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

describe("useSeedOnOpen", () => {
  it("keeps an edit across a new seed while open, and reseeds on the next open", async () => {
    let api: readonly [string, (value: string) => void] = ["", () => {}];
    function Probe({ open, seed }: { open: boolean; seed: string }) {
      api = useSeedOnOpen(open, () => seed);
      return null;
    }
    const root = await mount(() => h(Probe, { open: true, seed: "Post A" }));
    strictEqual(api[0], "Post A");
    await act(async () => api[1]("My edit"));
    // The tree (and so the seed) changes under the open dialog.
    await act(async () =>
      root.render(h(Probe, { open: true, seed: "Post B" })),
    );
    strictEqual(api[0], "My edit");
    await act(async () =>
      root.render(h(Probe, { open: false, seed: "Post B" })),
    );
    await act(async () =>
      root.render(h(Probe, { open: true, seed: "Post B" })),
    );
    deepStrictEqual(api[0], "Post B");
    await act(async () => root.unmount());
  });
});
