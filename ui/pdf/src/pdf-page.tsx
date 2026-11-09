import { cn } from "@houston-ai/core";
import { memo, useEffect, useRef, useState } from "react";
import { toBox } from "./geometry";
import { PageMarks, type PageMarksProps } from "./page-marks";
import {
  releaseCanvas,
  renderPageCanvas,
  renderTextLayer,
} from "./page-render";
import { PAGE_ATTR } from "./text-selection";
import type { PdfBox } from "./types";
import type { PdfDocumentHandle } from "./use-pdf-document";

interface PdfPageProps extends Omit<PageMarksProps, "size" | "obstacles"> {
  handle: PdfDocumentHandle;
  page: number;
  width: number;
  height: number;
  /** Close enough to the viewport to hold a rendered canvas. */
  near: boolean;
  label: string;
  /** The page's current canvas, for crops; null when it is released. */
  onCanvas: (page: number, canvas: HTMLCanvasElement | null) => void;
  onError: (error: unknown) => void;
}

/**
 * One page: a skeleton at the page's aspect ratio until it renders, then the
 * canvas, the text layer and the marks. Off-screen pages release their
 * canvas. A new document version renders behind the old canvas and fades in
 * over it, so a rewrite never blanks the page.
 */
export const PdfPage = memo(function PdfPage({
  handle,
  page,
  width,
  height,
  near,
  label,
  onCanvas,
  onError,
  ...marks
}: PdfPageProps) {
  const host = useRef<HTMLDivElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [obstacles, setObstacles] = useState<PdfBox[]>([]);
  const renderWidth = Math.round(width);
  const onCanvasRef = useRef(onCanvas);
  onCanvasRef.current = onCanvas;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const el = host.current;
    if (!near || !el) return;
    const abort = new AbortController();
    renderPageCanvas(handle.doc, page, renderWidth, abort.signal).then(
      (canvas) => {
        if (!canvas) return;
        canvas.className = "pdf-canvas";
        const previous = [...el.children];
        if (previous.length) canvas.dataset.incoming = "true";
        el.append(canvas);
        requestAnimationFrame(() => delete canvas.dataset.incoming);
        for (const old of previous)
          setTimeout(() => {
            old.remove();
            releaseCanvas(old);
          }, 220);
        onCanvasRef.current(page, canvas);
        setRendered(true);
      },
      (error: unknown) => onErrorRef.current(error),
    );
    return () => abort.abort();
  }, [handle.doc, page, renderWidth, near]);

  // Out of the render window: drop the pixels and the text, rebuilt on return.
  useEffect(() => {
    const el = host.current;
    if (near || !el) return;
    for (const old of [...el.children]) releaseCanvas(old);
    el.replaceChildren();
    textLayer.current?.replaceChildren();
    setObstacles([]);
    onCanvasRef.current(page, null);
    setRendered(false);
  }, [near, page]);

  useEffect(() => {
    const el = host.current;
    return () => {
      for (const old of [...(el?.children ?? [])]) releaseCanvas(old);
    };
  }, []);

  useEffect(() => {
    const layer = textLayer.current;
    if (!near || !layer) return;
    const abort = new AbortController();
    renderTextLayer(handle.doc, page, layer, abort.signal).then(() => {
      if (abort.signal.aborted) return;
      const frame = layer.getBoundingClientRect();
      setObstacles(
        [...layer.querySelectorAll("span")]
          .map((span) => span.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => toBox(r, frame)),
      );
    }, onErrorRef.current);
    return () => abort.abort();
  }, [handle.doc, page, near]);

  const scale = width / (handle.sizes[page - 1]?.width ?? width);
  return (
    <section
      {...{ [PAGE_ATTR]: page }}
      data-theme="light"
      aria-label={label}
      className={cn("pdf-page", !rendered && "pdf-page-skeleton")}
      style={{
        width,
        height,
        ["--total-scale-factor" as string]: scale,
      }}
    >
      <div ref={host} className="pdf-canvas-host" />
      <div ref={textLayer} className="textLayer" />
      <PageMarks {...marks} size={{ width, height }} obstacles={obstacles} />
    </section>
  );
});
