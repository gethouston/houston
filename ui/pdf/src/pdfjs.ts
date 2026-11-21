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
    const port = new worker.default();
    return { pdfjs, worker: pdfjs.PDFWorker.create({ port }) };
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export async function loadPdfJs(): Promise<PdfJs> {
  return (await load()).pdfjs;
}

export async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const { pdfjs, worker } = await load();
  return pdfjs.getDocument({ data, worker }).promise;
}

export type { PdfJs };
