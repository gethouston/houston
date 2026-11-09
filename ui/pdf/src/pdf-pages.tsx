import { cn } from "@houston-ai/core";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cropSelection } from "./crop";
import { anchorBounds } from "./geometry";
import { PdfPage } from "./pdf-page";
import type { PdfAnchor, PdfBox, PdfMark, PdfSelection } from "./types";
import { usePageLayout } from "./use-page-layout";
import type { PdfDocumentHandle } from "./use-pdf-document";
import { type PageHit, useSelectionGestures } from "./use-selection-gestures";

export interface PdfPagesHandle {
  scrollToPage: (page: number, opts?: { smooth?: boolean }) => void;
  /** Bring a mark into view (a third of the way down) and flash it. */
  revealMark: (id: string) => void;
  focus: () => void;
}

/** A selection the viewer hands up, with a live rect to anchor UI to. */
export interface PdfSelectEvent {
  selection: PdfSelection;
  /** The selection's bounds on screen right now (it moves with scroll). */
  rect: () => DOMRect;
}

export interface PdfPagesProps {
  handle: PdfDocumentHandle;
  zoom: number;
  marks: readonly PdfMark[];
  /** The selection waiting for its comment, drawn dashed. */
  pending: { page: number; anchor: PdfAnchor } | null;
  selectable: boolean;
  hotMarkId: string | null;
  onHotMark: (id: string | null) => void;
  onMarkActivate: (id: string, pin: HTMLElement) => void;
  onSelect: (event: PdfSelectEvent) => void;
  /** Touch: the native text selection under the handles, or null. */
  onTouchText: (event: PdfSelectEvent | null) => void;
  /** A gesture started on the pages: drop any pending selection. */
  onGestureStart: () => void;
  onActivePage: (page: number) => void;
  onError: (error: unknown) => void;
  pageLabel: (page: number, count: number) => string;
  pinLabel: (mark: PdfMark) => string;
  className?: string;
}

/** The continuous column of pages: layout, rendering near the viewport,
 *  selection, and the marks drawn on each page. */
export const PdfPages = forwardRef<PdfPagesHandle, PdfPagesProps>(
  function PdfPages(props, ref) {
    const { handle, marks, pending, selectable } = props;
    const scroller = useRef<HTMLDivElement>(null);
    const content = useRef<HTMLDivElement>(null);
    const canvases = useRef(new Map<number, HTMLCanvasElement>());
    const [draft, setDraft] = useState<{ page: number; box: PdfBox } | null>(
      null,
    );
    const pad = 16;
    const layout = usePageLayout(scroller, handle.sizes, props.zoom, 16, pad);
    const onActivePage = useRef(props.onActivePage);
    onActivePage.current = props.onActivePage;
    useEffect(() => onActivePage.current(layout.active), [layout.active]);

    const toEvent = useCallback(
      (hit: PageHit): PdfSelectEvent => {
        const canvas = canvases.current.get(hit.page);
        const bounds = anchorBounds(hit.anchor);
        return {
          selection: {
            page: hit.page,
            pageCount: handle.pageCount,
            anchor: hit.anchor,
            cropBase64: canvas ? cropSelection(canvas, hit.anchor, hit.el) : "",
          },
          rect: () => {
            const frame = hit.el.getBoundingClientRect();
            return new DOMRect(
              frame.left + (bounds.x / 100) * frame.width,
              frame.top + (bounds.y / 100) * frame.height,
              (bounds.w / 100) * frame.width,
              (bounds.h / 100) * frame.height,
            );
          },
        };
      },
      [handle.pageCount],
    );

    useSelectionGestures(content, {
      enabled: selectable,
      onSelect: (hit) => props.onSelect(toEvent(hit)),
      onDraft: setDraft,
      onTouchText: (hit) => props.onTouchText(hit ? toEvent(hit) : null),
      onStart: props.onGestureStart,
    });

    useImperativeHandle(ref, () => ({
      scrollToPage: (page, opts) =>
        layout.scrollToPage(page, opts?.smooth ?? true),
      revealMark: (id) => {
        const mark = marks.find((m) => m.id === id);
        if (!mark) return;
        layout.scrollToPage(mark.page, true, anchorBounds(mark.anchor).y);
        const pin = content.current?.querySelector<HTMLElement>(
          `[data-pdf-pin="${CSS.escape(id)}"]`,
        );
        pin?.closest(".pdf-mark")?.setAttribute("data-flash", "true");
        setTimeout(
          () => pin?.closest(".pdf-mark")?.removeAttribute("data-flash"),
          1400,
        );
      },
      focus: () => scroller.current?.focus({ preventScroll: true }),
    }));

    const onCanvas = useCallback(
      (page: number, canvas: HTMLCanvasElement | null) => {
        if (canvas) canvases.current.set(page, canvas);
        else canvases.current.delete(page);
      },
      [],
    );

    return (
      <div
        ref={scroller}
        tabIndex={-1}
        className={cn(
          "pdf-scroller relative min-h-0 flex-1 overflow-auto overscroll-contain bg-gutter outline-none",
          props.className,
        )}
      >
        <div
          ref={content}
          className="relative"
          style={{
            height: layout.contentHeight,
            width: `max(100%, ${layout.pageWidth + pad * 2}px)`,
          }}
        >
          {layout.boxes.map((box, i) => {
            const page = i + 1;
            return (
              <div
                key={page}
                className="absolute"
                style={{
                  top: box.top,
                  left: `calc(50% - ${box.width / 2}px)`,
                }}
              >
                <PdfPage
                  handle={handle}
                  page={page}
                  width={box.width}
                  height={box.height}
                  near={layout.near.has(page)}
                  label={props.pageLabel(page, handle.pageCount)}
                  marks={marks.filter((m) => m.page === page)}
                  pending={pending?.page === page ? pending.anchor : null}
                  draft={draft?.page === page ? draft.box : null}
                  hotMarkId={props.hotMarkId}
                  onHot={props.onHotMark}
                  onActivate={props.onMarkActivate}
                  pinLabel={props.pinLabel}
                  onCanvas={onCanvas}
                  onError={props.onError}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
