// Real-DOM mount of the composer on a WebKit older than Safari 16, which has
// no `HTMLFormElement.prototype.requestSubmit` (HOUSTON-APP-5KR): Enter must
// still reach the submit handler with what the person typed.

import { strict as assert } from "node:assert";
import { after, describe, it } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const win = dom.window;
const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.document = win.document;
Object.defineProperty(g, "navigator", {
  configurable: true,
  value: win.navigator,
});
for (const key of [
  "Element",
  "Event",
  "FormData",
  "HTMLElement",
  "HTMLFormElement",
  "HTMLTextAreaElement",
  "KeyboardEvent",
  "MouseEvent",
  "Node",
]) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
g.IS_REACT_ACT_ENVIRONMENT = true;
g.ResizeObserver = class {
  observe() {}
  disconnect() {}
};

const React = await import("react");
const { act, createElement: h } = React;
g.React = React;
const { createRoot } = await import("react-dom/client");
const { PromptInput, PromptInputTextarea } =
  await import("../src/ai-elements/prompt-input.tsx");

const proto = win.HTMLFormElement.prototype as unknown as Record<
  string,
  unknown
>;
const requestSubmit = proto.requestSubmit;
after(() => {
  proto.requestSubmit = requestSubmit;
});

describe("composer Enter without requestSubmit", () => {
  it("sends the typed text", async () => {
    delete proto.requestSubmit;
    const sent: string[] = [];
    const container = win.document.createElement("div");
    win.document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        h(
          PromptInput,
          { onSubmit: ({ text }: { text: string }) => void sent.push(text) },
          h(PromptInputTextarea),
        ),
      ),
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "hola";

    await act(async () => {
      textarea.dispatchEvent(
        new win.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    assert.deepEqual(sent, ["hola"]);
    act(() => root.unmount());
    container.remove();
  });
});
