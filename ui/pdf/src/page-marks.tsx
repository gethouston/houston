import { cn } from "@houston-ai/core";
import type { CSSProperties } from "react";
import { placePin } from "./geometry";
import type { PdfAnchor, PdfBox, PdfMark } from "./types";

const at = (b: PdfBox): CSSProperties => ({
  left: `${b.x}%`,
  top: `${b.y}%`,
  width: `${b.w}%`,
  height: `${b.h}%`,
});

function AnchorShapes({
  anchor,
  tone,
}: {
  anchor: PdfAnchor;
  tone: "mark" | "pending";
}) {
  if (anchor.kind === "text")
    return anchor.boxes.map((box) => (
      <span
        key={`${box.x}:${box.y}`}
        className={cn("pdf-hl", tone === "pending" && "pdf-hl-pending")}
        style={at(box)}
      />
    ));
  return (
    <span
      className={cn("pdf-area", tone === "pending" && "pdf-area-pending")}
      style={at(anchor.box)}
    />
  );
}

export interface PageMarksProps {
  marks: readonly PdfMark[];
  pending: PdfAnchor | null;
  draft: PdfBox | null;
  size: { width: number; height: number };
  obstacles: readonly PdfBox[];
  hotMarkId: string | null;
  onHot: (id: string | null) => void;
  onActivate: (id: string, pin: HTMLElement) => void;
  pinLabel: (mark: PdfMark) => string;
}

/** The comments drawn on one page: highlights or outlines, each with its
 *  numbered pin, plus the selection waiting for a comment. */
export function PageMarks({
  marks,
  pending,
  draft,
  size,
  obstacles,
  hotMarkId,
  onHot,
  onActivate,
  pinLabel,
}: PageMarksProps) {
  return (
    <div className="pdf-marks">
      {marks.map((mark) => {
        const pin = placePin(mark.anchor, size, obstacles);
        return (
          <div
            key={mark.id}
            className="pdf-mark"
            data-hot={hotMarkId === mark.id ? "true" : undefined}
          >
            <AnchorShapes anchor={mark.anchor} tone="mark" />
            <button
              type="button"
              data-pdf-pin={mark.id}
              className="pdf-pin"
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              aria-label={pinLabel(mark)}
              onPointerEnter={() => onHot(mark.id)}
              onPointerLeave={() => onHot(null)}
              onFocus={() => onHot(mark.id)}
              onBlur={() => onHot(null)}
              onClick={(e) => onActivate(mark.id, e.currentTarget)}
            >
              {mark.n}
            </button>
          </div>
        );
      })}
      {pending && (
        <div className="pdf-mark">
          <AnchorShapes anchor={pending} tone="pending" />
        </div>
      )}
      {draft && (
        <span className="pdf-area pdf-area-pending" style={at(draft)} />
      )}
    </div>
  );
}
