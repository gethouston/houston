// The pdf.js worker for a test: the real worker code, run on this thread
// behind a port, in place of the `?worker` bundle only Vite can build.
// Importing this file makes it what `ui/pdf/src/pdfjs.ts` gets for that
// bundle. A real worker thread answers late whenever it is busy (parsing,
// rendering a page); `workerThread.pause()` is that, so a test can hold a
// document mid-close.

import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const pdfPackage = createRequire(
  new URL("../../../ui/pdf/src/pdfjs.ts", import.meta.url),
);
const built = (file: string) =>
  pathToFileURL(pdfPackage.resolve(`pdfjs-dist/legacy/build/${file}`)).href;

// Under Node, pdf.js looks for the optional native canvas package to draw
// with and to borrow `DOMMatrix` and `Path2D` from. Nothing here draws, so it
// gets an empty stand-in for the three instead of a missing package.
const NO_CANVAS = "pdf-test:no-canvas";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith("pdf.worker.min.mjs?worker"))
      return { url: import.meta.url, shortCircuit: true };
    if (specifier === "@napi-rs/canvas")
      return { url: NO_CANVAS, format: "commonjs", shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url !== NO_CANVAS) return nextLoad(url, context);
    const source =
      "module.exports = { DOMMatrix: class {}, Path2D: class {} };";
    return { format: "commonjs", source, shortCircuit: true };
  },
});

// pdf.js does that lookup with `require` as it loads, and a `node:test` module
// mock takes `require` away from these hooks, so it loads here, ahead of any
// mock the importing test registers.
await import(built("pdf.mjs"));

const { WorkerMessageHandler } = (await import(built("pdf.worker.mjs"))) as {
  WorkerMessageHandler: { initializeFromPort(port: unknown): void };
};

type Listener = (event: { data: unknown }) => void;

let held: (() => void)[] | null = null;

export const workerThread = {
  /** The thread is busy: nothing it was sent is handled or answered. */
  pause() {
    held ??= [];
  },
  /** The thread is free again and works through what queued up, in order. */
  resume() {
    const queue = held ?? [];
    held = null;
    for (const deliver of queue) deliver();
  },
};

export default class LoopbackWorker {
  #listeners = new Map<Listener, (() => void) | null>();

  constructor() {
    WorkerMessageHandler.initializeFromPort(this);
  }

  postMessage(message: unknown, transfer?: Transferable[]) {
    const event = {
      data: structuredClone(message, transfer ? { transfer } : undefined),
    };
    const deliver = () =>
      queueMicrotask(() => {
        for (const listener of [...this.#listeners.keys()]) listener(event);
      });
    if (held) held.push(deliver);
    else deliver();
  }

  addEventListener(
    _name: string,
    listener: Listener,
    options?: { signal?: AbortSignal },
  ) {
    const signal = options?.signal;
    if (!signal) {
      this.#listeners.set(listener, null);
      return;
    }
    const onAbort = () => this.removeEventListener(_name, listener);
    signal.addEventListener("abort", onAbort);
    this.#listeners.set(listener, () =>
      signal.removeEventListener("abort", onAbort),
    );
  }

  removeEventListener(_name: string, listener: Listener) {
    this.#listeners.get(listener)?.();
    this.#listeners.delete(listener);
  }

  terminate() {
    for (const stop of this.#listeners.values()) stop?.();
    this.#listeners.clear();
  }
}

// pdf.js only takes a port that is an instance of the page's `Worker`.
Object.assign(globalThis, { Worker: LoopbackWorker });

/** A one-page PDF, 200 x 100 points. */
export function onePagePdf(): Uint8Array<ArrayBuffer> {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >>",
  ];
  let file = "%PDF-1.4\n";
  const offsets = objects.map((object, i) => {
    const at = file.length;
    file += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return at;
  });
  const xref = file.length;
  const rows = offsets.map(
    (at) => `${String(at).padStart(10, "0")} 00000 n \n`,
  );
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows.join("")}`;
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  file += `startxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(file);
}
