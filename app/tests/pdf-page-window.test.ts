import { strict as assert } from "node:assert";
import { describe, it, mock } from "node:test";
import "./support/dom-env.ts";

// A page that leaves the viewer's render window gives back its canvas pixels
// (WebKit budgets live canvases) and its text layer, and rebuilds both when it
// comes back.

const React = await import("react");
Object.assign(globalThis, { React });
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
  cb: () => void,
) => setTimeout(cb, 0);

let textRenders = 0;
mock.module("@houston-ai/core", {
  namedExports: { cn: (...p: unknown[]) => p.filter(Boolean).join(" ") },
});
mock.module(new URL("../../ui/pdf/src/page-render.ts", import.meta.url).href, {
  namedExports: {
    releaseCanvas: (el: HTMLCanvasElement) => {
      el.width = 0;
      el.height = 0;
    },
    renderPageCanvas: async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 600;
      return canvas;
    },
    renderTextLayer: async (
      _doc: unknown,
      _page: number,
      container: HTMLElement,
    ) => {
      textRenders++;
      container.replaceChildren(document.createElement("span"));
    },
  },
});

const { PdfPage } = await import("../../ui/pdf/src/pdf-page.tsx");

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++)
      await new Promise<void>((resolve) => setImmediate(resolve));
  });

describe("pdf page render window", () => {
  it("releases its canvas and text when it leaves, and rebuilds on return", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const canvases: (HTMLCanvasElement | null)[] = [];
    const handle = {
      doc: {},
      pageCount: 1,
      sizes: [{ width: 800, height: 600 }],
      version: 1,
    } as never;
    const render = (near: boolean) =>
      act(async () => {
        root.render(
          h(PdfPage, {
            handle,
            page: 1,
            width: 800,
            height: 600,
            near,
            label: "Page 1",
            onCanvas: (_p: number, c: HTMLCanvasElement | null) =>
              canvases.push(c),
            onError: (e: unknown) => assert.fail(String(e)),
            marks: [],
            pending: null,
            draft: null,
            hotMarkId: null,
            onHot: () => {},
            onActivate: () => {},
            pinLabel: () => "",
          }),
        );
      });
    const text = () => container.querySelector(".textLayer");

    await render(true);
    await flush();
    const canvas = canvases[0];
    assert.equal(canvas?.width, 800);
    assert.equal(text()?.childElementCount, 1);

    await render(false);
    await flush();
    assert.equal(canvas?.width, 0);
    assert.equal(canvas?.height, 0);
    assert.equal(container.querySelector("canvas"), null);
    assert.equal(text()?.childElementCount, 0);
    assert.equal(canvases.at(-1), null);

    await render(true);
    await flush();
    assert.equal(textRenders, 2);
    assert.equal(text()?.childElementCount, 1);
    assert.ok(container.querySelector("canvas"));

    await act(async () => root.unmount());
    container.remove();
  });
});
