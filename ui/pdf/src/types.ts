/** A rectangle on a page, in percent of the page's width and height. */
export interface PdfBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a selection or a mark points at on one page. */
export type PdfAnchor =
  | { kind: "text"; quote: string; boxes: PdfBox[] }
  | { kind: "area"; box: PdfBox };

/** A finished selection, ready to become a comment. */
export interface PdfSelection {
  /** 1-based page. */
  page: number;
  pageCount: number;
  anchor: PdfAnchor;
  /** PNG of the region with some page around it and the selection drawn on,
   *  base64 without a `data:` prefix. Empty when the page had not rendered. */
  cropBase64: string;
}

/** A numbered comment drawn on its page. */
export interface PdfMark {
  id: string;
  /** The number its chip shows. */
  n: number;
  page: number;
  anchor: PdfAnchor;
  comment: string;
  /** The page no longer exists in the current file. */
  detached?: boolean;
}

/** A page's size in PDF units (points). */
export interface PdfPageSize {
  width: number;
  height: number;
}

/** "fit" sizes pages to the viewer's width; a number multiplies that. */
export type PdfZoom = number;
