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

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let loading: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  loading ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker"),
    ]);
    pdfjs.GlobalWorkerOptions.workerPort = new worker.default();
    return pdfjs;
  })();
  // A failed load (offline chunk fetch) must be retryable on the next open.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export type { PdfJs };
