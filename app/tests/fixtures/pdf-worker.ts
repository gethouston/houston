import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const pdfPackage = createRequire(
  new URL("../../../ui/pdf/src/pdfjs.ts", import.meta.url),
);
const built = (file: string) =>
  pathToFileURL(pdfPackage.resolve(`pdfjs-dist/legacy/build/${file}`)).href;

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

await import(built("pdf.mjs"));

const { WorkerMessageHandler } = (await import(built("pdf.worker.mjs"))) as {
  WorkerMessageHandler: { initializeFromPort(port: unknown): void };
};

type Listener = (event: { data: unknown }) => void;

let held: (() => void)[] | null = null;

export const workerThread = {
  pause() {
    held ??= [];
  },
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

Object.assign(globalThis, { Worker: LoopbackWorker });

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
