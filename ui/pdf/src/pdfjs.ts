/**
 * pdf.js, loaded on first use so the ~1.3 MB library stays out of the app's
 * entry chunk.
 *
 * The LEGACY build: the modern one calls `Promise.withResolvers`,
 * `Math.sumPrecise`, `Map.prototype.getOrInsert` and `Uint8Array.fromBase64`
 * unpolyfilled, which the WebKit behind macOS 10.15 and iOS 15 (the desktop
 * and mobile minimums) does not have; the legacy build bundles core-js for
 * them. Its worker comes in through Vite's `?worker`, so the worker is bundled
 * and down-levelled with the app's build target, and runs from the app's own
 * origin in the Tauri webview, the web build and Vite dev alike.
 */

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
interface Loaded {
  pdfjs: PdfJs;
  worker: InstanceType<PdfJs["PDFWorker"]>;
}

let loading: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
  loading ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker"),
    ]);
    // One worker for every document, owned here and handed to each open. A
    // worker pdf.js makes itself (`GlobalWorkerOptions.workerPort`) belongs to
    // every document on it: closing one tears it down, and until the worker
    // thread has answered that close every other open throws.
    const port = new worker.default();
    return { pdfjs, worker: pdfjs.PDFWorker.create({ port }) };
  })();
  // A failed load (offline chunk fetch) must be retryable on the next open.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export async function loadPdfJs(): Promise<PdfJs> {
  return (await load()).pdfjs;
}

/** Open a PDF's bytes on the shared worker. */
export async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const { pdfjs, worker } = await load();
  return pdfjs.getDocument({ data, worker }).promise;
}

export type { PdfJs };
