// Real-DOM mount of a board's chat with the app's own draft wiring
// (`useBoardDrafts` over the draft store), pinning that a keystroke
// re-renders the composer and nothing else. When the board held the draft
// text, every key re-rendered the board, its cards and the whole message
// list, and typing in a long chat lagged behind the keys.
//
// The DOM-mounting pattern is ui/chat's (`tests/interaction-card-mount.test.ts`).

import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const win = dom.window;
const g = globalThis as unknown as Record<string, unknown>;
const w = win as unknown as Record<string, unknown>;
g.window = win;
g.document = win.document;
Object.defineProperty(g, "navigator", {
  configurable: true,
  value: win.navigator,
});
for (const key of [
  "CSSStyleDeclaration",
  "DOMRect",
  "Element",
  "Event",
  "FormData",
  "HTMLFormElement",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "KeyboardEvent",
  "MouseEvent",
  "Node",
  "SVGElement",
  "cancelAnimationFrame",
  "getComputedStyle",
  "requestAnimationFrame",
]) {
  g[key] = w[key];
}
w.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
// The split view and the log observe their panes; jsdom has neither observer
// and the geometry they would report is irrelevant here.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
for (const key of ["ResizeObserver", "IntersectionObserver"]) {
  g[key] = NoopObserver;
  w[key] = NoopObserver;
}
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h } = React;
g.React = React;
const { createRoot } = await import("react-dom/client");
const { AIBoard } = await import("@houston-ai/board");
const { TooltipProvider } = await import("@houston-ai/core");
const { useBoardDrafts } = await import(
  "../src/components/board/use-board-drafts.ts"
);
const { useDraftStore } = await import("../src/stores/drafts.ts");

const SESSION = "activity-m0";
const feed = Array.from({ length: 40 }, (_, i) =>
  i % 2 === 0
    ? { feed_type: "user_message" as const, id: `u${i}`, data: `Question ${i}` }
    : {
        feed_type: "assistant_text" as const,
        id: `a${i}`,
        data: `Answer ${i}`,
      },
);
const items = Array.from({ length: 10 }, (_, i) => ({
  id: `m${i}`,
  title: `Mission ${i}`,
  status: "done",
  lastMessageAt: "2026-11-14T12:00:00.000Z",
}));

const renders = { board: 0, userMessages: 0 };
const sent: string[] = [];
let openNewPanel: (() => void) | undefined;

function Board({ selectedId }: { selectedId: string | null }) {
  renders.board += 1;
  const { draftStore } = useBoardDrafts("agent-a");
  return h(AIBoard, {
    items,
    selectedId,
    feedItems: { [SESSION]: feed },
    draftStore,
    onSendMessage: async (_key: string, text: string) => {
      sent.push(text);
    },
    onNewPanelOpenerReady: (open: () => void) => {
      openNewPanel = open;
    },
    renderUserMessage: () => {
      renders.userMessages += 1;
      return undefined;
    },
  });
}

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  unmount = undefined;
});

function mount(selectedId: string | null = "m0") {
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  const render = (id: string | null) =>
    act(() =>
      root.render(h(TooltipProvider, null, h(Board, { selectedId: id }))),
    );
  render(selectedId);
  unmount = () => {
    act(() => root.unmount());
    container.remove();
  };
  const textarea = () => {
    const el = container.querySelector("textarea");
    assert.ok(el, "the composer did not mount");
    return el;
  };
  return { render, textarea };
}

const setValue = Object.getOwnPropertyDescriptor(
  win.HTMLTextAreaElement.prototype,
  "value",
)?.set;

/** Type `text` one key at a time, the way React's onChange sees keystrokes. */
function type(textarea: HTMLTextAreaElement, text: string) {
  for (let i = 1; i <= text.length; i++) {
    act(() => {
      setValue?.call(textarea, text.slice(0, i));
      textarea.dispatchEvent(new win.Event("input", { bubbles: true }));
    });
  }
}

const draftAt = (key: string) => useDraftStore.getState().drafts[key]?.text;

describe("typing in a board's composer", () => {
  beforeEach(() => {
    useDraftStore.getState().reset();
    sent.length = 0;
    openNewPanel = undefined;
  });

  it("re-renders neither the board nor the message list", () => {
    const { textarea } = mount();
    const before = { ...renders };
    assert.ok(before.userMessages > 0, "the log rendered its messages");

    type(textarea(), "hello there");

    assert.equal(textarea().value, "hello there");
    assert.equal(draftAt(SESSION), "hello there", "parked per session");
    assert.deepEqual(renders, before);
  });

  it("shows text another writer parks in the draft (pills, dictation)", () => {
    const { textarea } = mount();
    act(() => useDraftStore.getState().setDraftText(SESSION, "from a pill"));
    assert.equal(textarea().value, "from a pill");
  });

  it("restores each session's own draft across a switch", () => {
    useDraftStore.getState().setDraftText("activity-m1", "for m1");
    const { render, textarea } = mount();
    type(textarea(), "for m0");
    render("m1");
    assert.equal(textarea().value, "for m1");
    render("m0");
    assert.equal(textarea().value, "for m0");
  });

  it("keeps the new-task draft in this agent's slot only (HOU-730)", () => {
    useDraftStore
      .getState()
      .setDraftText("new-conversation:agent-b", "parked for B");
    const { textarea } = mount(null);
    assert.ok(openNewPanel, "the board handed over its new-panel opener");
    act(() => openNewPanel?.());
    assert.equal(textarea().value, "", "another agent's draft never shows");

    type(textarea(), "for A");
    assert.equal(draftAt("new-conversation:agent-a"), "for A");
    assert.equal(draftAt("new-conversation:agent-b"), "parked for B");
  });

  it("clears the draft once the send lands", async () => {
    const { textarea } = mount();
    type(textarea(), "ship it");
    await act(async () => {
      textarea().dispatchEvent(
        new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    assert.deepEqual(sent, ["ship it"]);
    assert.equal(draftAt(SESSION), "");
    assert.equal(textarea().value, "");
  });
});
