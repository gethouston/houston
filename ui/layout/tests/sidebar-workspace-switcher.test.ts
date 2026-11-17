// Real-DOM mounts (jsdom globals BEFORE the dynamic react-dom import, as in
// sidebar-rail-controls.test.ts), so the menu can be opened and its header
// read.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import type { ReactElement, ReactNode } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});
// Radix's menu measures, observes and focuses: every DOM global it reaches for
// comes from the same jsdom window.
for (const key of [
  "Element",
  "HTMLElement",
  "HTMLButtonElement",
  "SVGElement",
  "Node",
  "NodeFilter",
  "Text",
  "DocumentFragment",
  "ShadowRoot",
  "DOMRect",
  "Event",
  "CustomEvent",
  "FocusEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "MutationObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
]) {
  g[key] = (dom.window as unknown as Record<string, unknown>)[key];
}
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
g.React = React;
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { TooltipProvider } = await import("@houston-ai/core");
const { SidebarWorkspaceSwitcher } =
  await import("../src/sidebar-workspace-switcher.tsx");

function withMounted(
  element: ReactElement,
  inspect: (root: HTMLElement) => void,
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(h(TooltipProvider, null, element)));
  try {
    inspect(container);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
}

function switcher(props: { header?: ReactNode }) {
  return h(
    SidebarWorkspaceSwitcher,
    {
      title: "Houston HQ",
      dataAttrs: { "data-tour-target": "workspaceMenu" },
      ...props,
    },
    h("span", { "data-menu-entry": "" }, "Taxflow"),
  );
}

/** Radix opens a dropdown on pointerdown (button 0), not on click. */
function open(trigger: Element) {
  act(() => {
    trigger.dispatchEvent(
      new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        pointerType: "mouse",
      }),
    );
  });
}

describe("SidebarWorkspaceSwitcher", () => {
  it("is a phone card's own row: the workspace and an up-down chevron", () => {
    withMounted(switcher({}), (root) => {
      const trigger = root.querySelector('[data-tour-target="workspaceMenu"]');
      assert.equal(trigger?.tagName, "BUTTON", "the anchor IS the trigger");
      assert.equal(trigger?.getAttribute("aria-haspopup"), "menu");
      const tokens = trigger?.className.split(" ") ?? [];
      for (const token of ["min-h-12", "px-4", "text-base", "w-full"]) {
        assert.ok(tokens.includes(token), token);
      }
      assert.ok(trigger?.querySelector("svg.lucide-chevrons-up-down"));
      assert.equal(trigger?.textContent, "Houston HQ", "the name alone");
      const name = [...(trigger?.querySelectorAll("span") ?? [])].find(
        (span) => span.textContent === "Houston HQ",
      );
      assert.ok(name?.className.includes("truncate"));
    });
  });

  it("holds no person: no portrait, no second line", () => {
    withMounted(switcher({ header: "Julian Arango" }), (root) => {
      assert.ok(!root.textContent?.includes("Julian Arango"));
      assert.equal(root.querySelector("[data-slot=avatar]"), null);
    });
  });

  it("heads the open menu with who is signed in, above the items", () => {
    withMounted(
      switcher({ header: h("b", { "data-header": "" }, "Julian Arango") }),
      (root) => {
        const trigger = root.querySelector("button");
        assert.ok(trigger);
        open(trigger);
        const menu = document.querySelector("[role=menu]");
        assert.ok(menu, "the menu opens");
        const header = menu.querySelector("[data-header]");
        const entry = menu.querySelector("[data-menu-entry]");
        assert.ok(header && entry);
        assert.equal(header.closest("[role=menuitem]"), null, "not an item");
        assert.ok(
          header.compareDocumentPosition(entry) &
            dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
        );
        assert.ok(menu.querySelector("[role=separator]"));
      },
    );
  });

  it("opens straight onto the items when there is no header", () => {
    withMounted(switcher({}), (root) => {
      const trigger = root.querySelector("button");
      assert.ok(trigger);
      open(trigger);
      const menu = document.querySelector("[role=menu]");
      assert.ok(menu?.querySelector("[data-menu-entry]"));
      assert.equal(menu?.querySelector("[role=separator]"), null);
    });
  });

  it("opens downward from the card's head", () => {
    withMounted(switcher({}), (root) => {
      const trigger = root.querySelector("button");
      assert.ok(trigger);
      open(trigger);
      const menu = document.querySelector("[role=menu]");
      assert.equal(menu?.getAttribute("data-side"), "bottom");
    });
  });

  it("is the whole row: no control sits beside the trigger", () => {
    withMounted(switcher({}), (root) => {
      const buttons = root.querySelectorAll("button");
      assert.equal(buttons.length, 1);
      assert.ok(buttons[0]?.className.split(" ").includes("w-full"));
    });
  });
});
