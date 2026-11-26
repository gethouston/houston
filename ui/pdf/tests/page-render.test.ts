import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderPageCanvas } from "../src/page-render.ts";

const g = globalThis as { document?: unknown };
beforeEach(() => {
  g.document = {
    createElement: () => ({ tagName: "CANVAS", width: 0, height: 0 }),
  };
});
afterEach(() => {
  delete g.document;
});

function docRendering(outcome: Promise<void>): PDFDocumentProxy {
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render: () => ({ promise: outcome, cancel: () => {} }),
  };
  return { getPage: async () => page } as unknown as PDFDocumentProxy;
}

function failure(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("renderPageCanvas", () => {
  it("resolves null when the document's destroy cancels the render", async () => {
    const cancelled = failure(
      "RenderingCancelledException",
      "Rendering cancelled, page 7",
    );
    const doc = docRendering(Promise.reject(cancelled));
    const result = await renderPageCanvas(
      doc,
      7,
      600,
      new AbortController().signal,
    );
    assert.equal(result, null);
  });

  it("still throws a real render failure", async () => {
    const doc = docRendering(Promise.reject(new Error("bad XRef entry")));
    await assert.rejects(
      renderPageCanvas(doc, 1, 600, new AbortController().signal),
      /bad XRef entry/,
    );
  });
});
