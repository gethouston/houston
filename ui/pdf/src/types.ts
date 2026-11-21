export interface PdfBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PdfAnchor =
  | { kind: "text"; quote: string; boxes: PdfBox[] }
  | { kind: "area"; box: PdfBox };

export interface PdfSelection {
  page: number;
  pageCount: number;
  anchor: PdfAnchor;
  previewBase64: string;
  crop: () => Promise<string>;
}

export interface PdfMark {
  id: string;
  n: number;
  page: number;
  anchor: PdfAnchor;
  comment: string;
  detached?: boolean;
}

export interface PdfPageSize {
  width: number;
  height: number;
}

export type PdfZoom = number;
