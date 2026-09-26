// Real-DOM mount of the rail's drag hook (the ui/chat interaction-card-mount
// pattern: jsdom globals BEFORE the dynamic react-dom import). Pins the drop
// hand-off: the host's store reaches the rail a tick after `onArrange`, and the
// rail must keep drawing the dropped arrangement in between instead of
// flashing the previous order back.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { JSDOM } from "jsdom";
import type {
  SidebarGroupView,
  SidebarRootEntry,
} from "../src/sidebar-groups.ts";
import type { SidebarArrangement } from "../src/sidebar-tree.ts";

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
for (const key of ["Element", "HTMLElement", "Node", "Event"]) {
  g[key] = (dom.window as unknown as Record<string, unknown>)[key];
}
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { useSidebarTreeDrag } = await import("../src/use-sidebar-tree-drag.ts");
const { treeRowKey } = await import("../src/sidebar-tree.ts");
const { SidebarGroupedList } = await import("../src/sidebar-grouped-list.tsx");

type Drag = ReturnType<typeof useSidebarTreeDrag>;

const items = ["A", "B", "x"].map((id) => ({ id, name: id }));
const groups: SidebarGroupView[] = [
  { id: "G", name: "G", collapsed: false, itemIds: ["x"] },
];
const order: SidebarRootEntry[] = [
  { kind: "agent", id: "A" },
  { kind: "agent", id: "B" },
  { kind: "group", id: "G" },
];

function mount(
  accept: ((next: SidebarArrangement) => boolean) | "absent" = () => true,
) {
  const container = document.createElement("div");
  const root = createRoot(container);
  let drag: Drag | null = null;
  const arranged: SidebarArrangement[] = [];
  const Probe = (props: {
    order: SidebarRootEntry[];
    groups: SidebarGroupView[];
  }) => {
    drag = useSidebarTreeDrag({
      items,
      groups: props.groups,
      order: props.order,
      onArrange:
        accept === "absent"
          ? undefined
          : (next) => {
              arranged.push(next);
              return accept(next);
            },
    });
    return null;
  };
  const render = (props: {
    order: SidebarRootEntry[];
    groups: SidebarGroupView[];
  }) => act(() => root.render(h(Probe, props)));
  const rows = () => (drag as Drag | null)?.rows.map(treeRowKey).join(" ");
  const dropAOnB = async () => {
    await act(() => {
      (drag as Drag | null)?.onDragStart({
        active: { id: "agent:A" },
      } as unknown as DragStartEvent);
    });
    await act(() => {
      (drag as Drag | null)?.onDragEnd({
        over: { id: "agent:B" },
        delta: { x: 0, y: 0 },
      } as unknown as DragEndEvent);
    });
  };
  return {
    render,
    rows,
    dropAOnB,
    arranged,
    unmount: () => act(() => root.unmount()),
  };
}

describe("sidebar drop hand-off", () => {
  it("draws the dropped order before the host's props catch up", async () => {
    const m = mount();
    await m.render({ order, groups });
    assert.equal(m.rows(), "agent:A agent:B group:G agent:x");
    await m.dropAOnB();
    assert.equal(m.arranged.length, 1);
    assert.equal(m.rows(), "agent:B agent:A group:G agent:x", "no flash back");
    await m.render({ order: m.arranged[0].order, groups });
    assert.equal(m.rows(), "agent:B agent:A group:G agent:x");
    await m.unmount();
  });

  it("follows the host again on its next props change (a rollback too)", async () => {
    const m = mount();
    await m.render({ order, groups });
    await m.dropAOnB();
    await m.render({
      order: [...order],
      groups: [...groups, { ...groups[0], id: "H", itemIds: [] }],
    });
    assert.equal(m.rows(), "agent:A agent:B group:G agent:x group:H");
    await m.unmount();
  });
});

describe("a drop nobody stored", () => {
  it("keeps the stored order when the host refuses the write", async () => {
    const m = mount(() => false);
    await m.render({ order, groups });
    await m.dropAOnB();
    assert.equal(m.arranged.length, 1);
    assert.equal(m.rows(), "agent:A agent:B group:G agent:x");
    await m.unmount();
  });

  it("keeps the stored order when the rail cannot store yet", async () => {
    const m = mount("absent");
    await m.render({ order, groups });
    await m.dropAOnB();
    assert.equal(m.rows(), "agent:A agent:B group:G agent:x");
    await m.unmount();
  });

  it("offers no drag or keyboard move while the rail cannot store", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        h(SidebarGroupedList, {
          items,
          groups,
          order,
          rowCtx: { selectedId: null, onSelect: () => {} },
        }),
      ),
    );
    const button = container.querySelector<HTMLElement>(
      '[data-item-id="A"] button',
    );
    assert.ok(button);
    assert.equal(button.getAttribute("aria-disabled"), "true");
    await act(() =>
      button.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "ArrowDown",
          altKey: true,
          bubbles: true,
        }),
      ),
    );
    assert.equal(
      [...container.querySelectorAll("[data-item-id]")]
        .map((row) => row.getAttribute("data-item-id"))
        .join(" "),
      "A B x",
    );
    await act(() => root.unmount());
    container.remove();
  });
});

it("activates an agent with Enter and arranges it with Alt+ArrowDown", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const selected: string[] = [];
  const activatedGroups: string[] = [];
  const arranged: SidebarArrangement[] = [];
  await act(() =>
    root.render(
      h(SidebarGroupedList, {
        items,
        groups,
        order,
        rowCtx: {
          selectedId: null,
          onSelect: (id: string) => selected.push(id),
        },
        onActivateGroup: (id: string) => activatedGroups.push(id),
        onArrange: (next: SidebarArrangement) => {
          arranged.push(next);
          return true;
        },
        labels: {
          dragKeyboardMoved: "Moviste %name% a %position%.",
          dragInstructions: "Usa el puntero o Alt y las flechas.",
        },
      }),
    ),
  );
  const button = container.querySelector<HTMLElement>(
    '[data-item-id="A"] button',
  );
  assert.ok(button);
  assert.match(
    document.body.textContent ?? "",
    /Usa el puntero o Alt y las flechas\./,
  );
  button.focus();
  await act(() =>
    button.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  assert.deepEqual(selected, ["A"]);
  await act(() =>
    button.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "ArrowDown",
        altKey: true,
        bubbles: true,
      }),
    ),
  );
  assert.deepEqual(arranged[0]?.order.slice(0, 2), [
    { kind: "agent", id: "B" },
    { kind: "agent", id: "A" },
  ]);
  assert.equal(document.activeElement, button);
  assert.equal(
    container.querySelector('[aria-live="polite"]')?.textContent,
    "Moviste A a 2.",
  );
  const groupButton = container.querySelector<HTMLElement>(
    '[data-sidebar-group="G"] button',
  );
  assert.ok(groupButton);
  await act(() =>
    groupButton.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: " ", bubbles: true }),
    ),
  );
  assert.deepEqual(activatedGroups, ["G"]);
  await act(() => root.unmount());
  container.remove();
});

// A row that stays mounted keeps its focus through a reorder: React restores
// the focused element after each commit. Only a row that leaves the screen
// needs the rail to move focus.
describe("focus after a keyboard move", () => {
  async function mountList(listGroups: SidebarGroupView[]) {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        h(SidebarGroupedList, {
          items,
          groups: listGroups,
          order,
          rowCtx: { selectedId: null, onSelect: () => {} },
          onArrange: () => true,
        }),
      ),
    );
    const press = async (id: string, key: string) => {
      const button = container.querySelector<HTMLElement>(
        `[data-item-id="${id}"] button`,
      );
      assert.ok(button);
      button.focus();
      await act(() =>
        button.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            key,
            altKey: true,
            bubbles: true,
          }),
        ),
      );
    };
    const done = async () => {
      await act(() => root.unmount());
      container.remove();
    };
    return { container, press, done };
  }

  it("moves focus to the collapsed group a row went into", async () => {
    const list = await mountList([{ ...groups[0], collapsed: true }]);
    try {
      await list.press("B", "ArrowDown");
      await list.press("B", "ArrowRight");
      assert.ok(
        list.container.querySelector('[data-item-id="B"]') === null,
        "the row went inside the folded group",
      );
      assert.ok(
        document.activeElement ===
          list.container.querySelector('[data-sidebar-group="G"] button'),
        "focus lands on that group's header",
      );
    } finally {
      await list.done();
    }
  });
});
