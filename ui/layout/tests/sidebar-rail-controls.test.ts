import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
import type { SidebarConnectLogo } from "../src/sidebar-connect-logos.tsx";

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
for (const key of ["Element", "HTMLElement", "Node", "Event", "MouseEvent"]) {
  g[key] = (dom.window as unknown as Record<string, unknown>)[key];
}
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
g.React = React;
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { TooltipProvider } = await import("@houston-ai/core");
const { AppSidebar } = await import("../src/sidebar.tsx");
const { SidebarAddRow } = await import("../src/sidebar-add-row.tsx");
const { SidebarConnectGroup } = await import(
  "../src/sidebar-connect-group.tsx"
);

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

const click = (button: Element | null) => {
  assert.ok(button, "the button renders");
  act(() => {
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
};

const logo = (id: string): SidebarConnectLogo => ({
  id,
  element: h("img", { alt: id, "data-logo": id }),
});

describe("SidebarAddRow", () => {
  it("is a 40px shortcut on the person row's columns, and a click adds", () => {
    let clicks = 0;
    withMounted(
      h(SidebarAddRow, {
        label: "Add new AI Employee",
        onClick: () => clicks++,
        dataAttrs: { "data-testid": "add" },
      }),
      (root) => {
        const rowRoot = root.querySelector('[data-testid="add"]');
        const button = root.querySelector('[data-testid="add"] > button');
        assert.equal(button?.textContent, "Add new AI Employee");
        const rootTokens = rowRoot?.className.split(" ") ?? [];
        assert.ok(rootTokens.includes("h-10"));
        assert.ok(!rootTokens.includes("h-16"));
        assert.ok(rootTokens.includes("before:inset-x-0"));
        const tokens = button?.className.split(" ") ?? [];
        assert.ok(tokens.includes("text-ink-muted"));
        assert.ok(tokens.includes("hover:text-ink"));
        assert.equal(root.querySelector("[data-person-text]"), null);
        const seat = root.querySelector("[data-sidebar-seat]");
        assert.ok(seat, "the empty seat");
        assert.ok(!seat.className.includes("bg-"));
        assert.ok(!seat.className.includes("rounded"));
        assert.ok(!seat.className.includes("border"));
        assert.equal(seat.getAttribute("style"), "width: 40px; height: 40px;");
        assert.equal(seat.querySelector("svg")?.getAttribute("width"), "16");
        click(button);
      },
    );
    assert.equal(clicks, 1);
  });

  it("collapses to the seat alone, named by its label", () => {
    let clicks = 0;
    withMounted(
      h(SidebarAddRow, {
        label: "Add new AI Employee",
        onClick: () => clicks++,
        collapsed: true,
      }),
      (root) => {
        const button = root.querySelector("button");
        assert.equal(button?.getAttribute("aria-label"), "Add new AI Employee");
        assert.equal(button?.textContent, "", "no visible words");
        assert.ok(button?.querySelector("[data-sidebar-seat]"));
        click(button);
      },
    );
    assert.equal(clicks, 1);
  });
});

describe("SidebarConnectGroup", () => {
  const four = ["gmail", "slack", "notion", "drive"].map(logo);
  const rows = (selected = false) => [
    {
      id: "apps",
      label: "Connect your apps",
      logos: four,
      onClick: () => {},
      selected,
      dataAttrs: { "data-testid": "apps" },
    },
    {
      id: "ai",
      label: "Connect your AI",
      logos: [logo("anthropic")],
      onClick: () => {},
    },
  ];

  it("draws plain rows on the rail inset, painted only on hover", () => {
    withMounted(h(SidebarConnectGroup, { rows: rows() }), (root) => {
      const group = root.querySelector("[data-sidebar-connect-group]");
      assert.ok(group, "the group");
      assert.ok(group.className.split(" ").includes("px-2"), "the rail inset");
      for (const chrome of ["bg-", "border", "divide", "shadow", "rounded"]) {
        assert.equal(group.className.includes(chrome), false, chrome);
      }
      const buttons = [...group.querySelectorAll(":scope > button")];
      assert.equal(buttons.length, 2, "the rows sit on the rail itself");
      for (const button of buttons) {
        const classes = button.className.split(" ");
        for (const token of ["h-9", "rounded-lg", "hover:bg-sidebar-hover"]) {
          assert.ok(classes.includes(token), token);
        }
        assert.equal(
          classes.some((one) => one.startsWith("bg-")),
          false,
          "no fill at rest",
        );
      }
    });
  });

  it("overlaps at most three logos into one mark, the first on top", () => {
    withMounted(h(SidebarConnectGroup, { rows: rows() }), (root) => {
      const apps = root.querySelector('[data-testid="apps"]');
      const cluster = apps?.querySelector("[data-sidebar-connect-cluster]");
      assert.ok(cluster, "the cluster");
      const marks = [
        ...cluster.querySelectorAll("[data-sidebar-connect-logo]"),
      ];
      assert.deepEqual(
        marks.map((mark) =>
          mark.querySelector("[data-logo]")?.getAttribute("data-logo"),
        ),
        ["gmail", "slack", "notion"],
      );
      for (const mark of marks) {
        const classes = mark.className.split(" ");
        for (const token of [
          "size-5",
          "rounded-md",
          "bg-popover",
          "border-line",
        ]) {
          assert.ok(classes.includes(token), token);
        }
        assert.equal(
          classes.some((one) => one.startsWith("shadow")),
          false,
          mark.className,
        );
        assert.equal(mark.getAttribute("style"), null, "no mask");
      }
      const slots = [...cluster.children];
      assert.equal(slots[0]?.className.includes("-ml-"), false);
      assert.ok(slots[1]?.className.split(" ").includes("-ml-1.5"));
      assert.ok(slots[2]?.className.split(" ").includes("-ml-1.5"));
      const z = slots.map((slot) =>
        Number(slot.getAttribute("style")?.match(/z-index: (\d+)/)?.[1]),
      );
      assert.deepEqual(z, [3, 2, 1], "the first on top");
      assert.equal(apps?.textContent, "Connect your apps");
    });
  });

  it("sizes every logo in the same box, whatever element it is", () => {
    const mixed = [
      { id: "img", element: h("img", { alt: "" }) },
      { id: "wrapped", element: h("span", {}, h("svg")) },
    ];
    withMounted(
      h(SidebarConnectGroup, { rows: [{ ...rows()[0], logos: mixed }] }),
      (root) => {
        const boxes = [
          ...root.querySelectorAll("[data-sidebar-connect-logo] > span"),
        ];
        assert.equal(boxes.length, 2);
        for (const box of boxes) {
          const classes = box.className.split(" ");
          assert.ok(classes.includes("size-3.5"), "the row's 14px logo box");
          assert.ok(classes.includes("[&>*]:size-full"), "fills it");
        }
      },
    );
  });

  it("leads each row with its logo cluster, then the label", () => {
    withMounted(h(SidebarConnectGroup, { rows: rows() }), (root) => {
      const apps = root.querySelector('[data-testid="apps"]');
      assert.ok(
        apps?.firstElementChild?.hasAttribute("data-sidebar-connect-cluster"),
      );
      assert.equal(apps?.children[1]?.textContent, "Connect your apps");
    });
  });

  it("names each row by its label alone, in the rail's row type", () => {
    withMounted(h(SidebarConnectGroup, { rows: rows() }), (root) => {
      const label = root.querySelector(
        '[data-testid="apps"] > span:not([aria-hidden])',
      );
      assert.equal(label?.textContent, "Connect your apps");
      for (const token of ["text-[13px]", "font-weight-510"]) {
        assert.ok(label?.className.split(" ").includes(token), token);
      }
      const button = root.querySelector('[data-testid="apps"]');
      let named = button?.textContent ?? "";
      for (const hidden of button?.querySelectorAll('[aria-hidden="true"]') ??
        []) {
        named = named.replace(hidden.textContent ?? "", "");
      }
      assert.equal(named, "Connect your apps");
      assert.ok(button?.querySelector('[aria-hidden="true"] [data-logo]'));
    });
  });

  it("says when a destination is open, and a click connects", () => {
    let clicks = 0;
    const clickable = rows(true).map((row) => ({
      ...row,
      onClick: () => clicks++,
    }));
    withMounted(h(SidebarConnectGroup, { rows: clickable }), (root) => {
      const [apps, ai] = root.querySelectorAll("button");
      assert.equal(apps?.getAttribute("aria-current"), "page");
      assert.ok(apps?.className.includes("bg-sidebar-active"));
      assert.equal(ai?.getAttribute("aria-current"), null);
      click(apps ?? null);
      click(ai ?? null);
    });
    assert.equal(clicks, 2);
  });

  it("collapses to one control per row, its logo cluster alone", () => {
    withMounted(
      h(SidebarConnectGroup, { rows: rows(true), collapsed: true }),
      (root) => {
        const buttons = [...root.querySelectorAll("button")];
        assert.deepEqual(
          buttons.map((button) => button.getAttribute("aria-label")),
          ["Connect your apps", "Connect your AI"],
        );
        assert.equal(buttons[0]?.getAttribute("aria-current"), "page");
        assert.deepEqual(
          [...(buttons[0]?.querySelectorAll("[data-logo]") ?? [])].map((one) =>
            one.getAttribute("data-logo"),
          ),
          ["gmail", "slack", "notion"],
        );
        assert.ok(buttons[0]?.querySelector("[data-sidebar-connect-cluster]"));
        for (const mark of buttons[0]?.querySelectorAll(
          "[data-sidebar-connect-logo]",
        ) ?? []) {
          assert.ok(mark.className.split(" ").includes("size-4"));
        }
        assert.equal(root.textContent, "", "no words on the icon rail");
      },
    );
  });

  it("draws a phone sheet's own rows: 48px, 16px words, the card's edge", () => {
    withMounted(
      h(SidebarConnectGroup, { rows: rows(), surface: "sheet" }),
      (root) => {
        const group = root.querySelector("[data-sidebar-connect-group]");
        const classes = group?.className.split(" ") ?? [];
        assert.equal(classes.includes("px-2"), false, "no rail inset");
        for (const button of group?.querySelectorAll(":scope > button") ?? []) {
          const tokens = button.className.split(" ");
          for (const token of ["min-h-12", "px-4", "text-base", "w-full"]) {
            assert.ok(tokens.includes(token), token);
          }
          for (const gone of ["h-9", "rounded-lg", "px-3"]) {
            assert.equal(tokens.includes(gone), false, gone);
          }
        }
        const label = root.querySelector(
          '[data-testid="apps"] > span:not([aria-hidden])',
        );
        assert.equal(label?.className.includes("text-[13px]"), false);
      },
    );
  });

  it("shows a neutral glyph on the icon rail for a row with no logo", () => {
    withMounted(
      h(SidebarConnectGroup, {
        rows: [{ ...rows()[0], logos: [] }],
        collapsed: true,
      }),
      (root) => {
        assert.equal(root.querySelector("[data-sidebar-connect-logo]"), null);
        assert.ok(root.querySelector("svg"), "a neutral glyph");
      },
    );
  });
});

describe("AppSidebar listFooter", () => {
  const items = [{ id: "ada", name: "ada" }];
  const footer = h("i", { "data-testid": "list-tail" });

  for (const collapsed of [false, true]) {
    it(`closes the list inside its scroll box (${collapsed ? "icon rail" : "expanded"})`, () => {
      withMounted(
        h(AppSidebar, {
          items,
          onSelect: () => {},
          groups: [],
          listFooter: footer,
          collapsed,
        }),
        (root) => {
          const tail = root.querySelector('[data-testid="list-tail"]');
          assert.ok(tail, "the footer renders");
          assert.ok(
            tail.closest("[data-slot=scroll-area]"),
            "inside the scroll box",
          );
          const row = root.querySelector(
            collapsed ? 'button[aria-label="ada"]' : "[data-sidebar-row]",
          );
          assert.ok(row, "the employee renders");
          assert.ok(
            row.compareDocumentPosition(tail) &
              dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
            "after the last row",
          );
        },
      );
    });
  }
});
