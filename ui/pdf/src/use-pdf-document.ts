import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { useEffect, useRef, useState } from "react";
import { firstPaintSizes, measureAll } from "./page-sizes";
import { loadPdfJs } from "./pdfjs";
import type { PdfPageSize } from "./types";

/** A loaded document. `version` counts the loads of this viewer, so a page
 *  rendered from an older version knows to render again. */
export interface PdfDocumentHandle {
  doc: PDFDocumentProxy;
  pageCount: number;
  sizes: PdfPageSize[];
  version: number;
}

export type PdfDocumentState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; handle: PdfDocumentHandle };

async function open(data: Blob, version: number): Promise<PdfDocumentHandle> {
  const pdfjs = await loadPdfJs();
  const bytes = new Uint8Array(await data.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const sizes = await firstPaintSizes(doc);
  return { doc, pageCount: doc.numPages, sizes, version };
}

/**
 * Load `data` as a PDF. A new blob for a document already on screen (the agent
 * rewrote the file) loads in the background and swaps in when ready, so the
 * reader never sees the pages blank out; a failed reload keeps the old pages.
 * Pages paint at page 1's size first; the rest are measured behind them.
 */
export function usePdfDocument(
  data: Blob | null,
  onError: (error: unknown) => void,
): PdfDocumentState {
  const [state, setState] = useState<PdfDocumentState>({ status: "loading" });
  const version = useRef(0);
  const current = useRef<PDFDocumentProxy | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!data) {
      setState({ status: "loading" });
      return;
    }
    let cancelled = false;
    const mine = ++version.current;
    open(data, mine).then(
      (handle) => {
        if (cancelled) {
          void handle.doc.loadingTask.destroy();
          return;
        }
        const previous = current.current;
        current.current = handle.doc;
        setState({ status: "ready", handle });
        if (previous) void previous.loadingTask.destroy();
        measureAll(handle.doc, handle.sizes).then((sizes) => {
          if (sizes && !cancelled && current.current === handle.doc)
            setState({ status: "ready", handle: { ...handle, sizes } });
        }, onErrorRef.current);
      },
      (error: unknown) => {
        if (cancelled) return;
        onErrorRef.current(error);
        if (!current.current) setState({ status: "error", error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(
    () => () => {
      void current.current?.loadingTask.destroy();
      current.current = null;
    },
    [],
  );

  return state;
}
