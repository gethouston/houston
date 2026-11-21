import { strict as assert } from "node:assert";
import { describe, it, mock } from "node:test";
import "./support/dom-env.ts";
import { onePagePdf, workerThread } from "./fixtures/pdf-worker.ts";

const React = await import("react");
Object.assign(globalThis, { React });
const { act, createElement: h, useEffect } = React;
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
const { usePdfDocument } = await import("../../ui/pdf/src/use-pdf-document.ts");

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

type DocumentState = ReturnType<typeof usePdfDocument>;

class PdfFile extends Blob {
  #read = Promise.withResolvers<void>();
  read = this.#read.promise;

  constructor() {
    super([onePagePdf()], { type: "application/pdf" });
  }

  override async arrayBuffer() {
    const bytes = await super.arrayBuffer();
    setImmediate(this.#read.resolve);
    return bytes;
  }
}

function Viewer(props: {
  file: Blob;
  onState: (state: DocumentState) => void;
  onError: (error: unknown) => void;
}) {
  const state = usePdfDocument(props.file, props.onError);
  useEffect(() => props.onState(state), [props, state]);
  return null;
}

describe("pdf document switch", () => {
  it("opens the next document while the previous one is still closing", async (t) => {
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    env.IS_REACT_ACT_ENVIRONMENT = false;
    t.after(() => {
      env.IS_REACT_ACT_ENVIRONMENT = true;
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const errors: string[] = [];
    const show = (name: string, file: Blob) => {
      const landed = Promise.withResolvers<DocumentState>();
      const onState = (state: DocumentState) => {
        if (state.status !== "loading") landed.resolve(state);
      };
      const onError = (error: unknown) => errors.push(String(error));
      root.render(h(Viewer, { key: name, file, onState, onError }));
      return landed.promise;
    };

    assert.equal((await show("first.pdf", new PdfFile())).status, "ready");

    workerThread.pause();
    const next = new PdfFile();
    const second = show("second.pdf", next);
    await next.read;
    workerThread.resume();

    const state = await second;
    assert.deepEqual(errors, []);
    assert.equal(state.status, "ready");
    assert.equal(state.status === "ready" && state.handle.pageCount, 1);

    root.unmount();
    container.remove();
  });
});
