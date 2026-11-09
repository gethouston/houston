import type { PdfPageSize } from "./types";

/** The slice of a pdf.js document the size measuring reads. */
export interface SizedDoc {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number; height: number };
  }>;
  loadingTask: { destroy(): Promise<void> };
}

async function pageSize(doc: SizedDoc, n: number): Promise<PdfPageSize> {
  const { width, height } = (await doc.getPage(n)).getViewport({ scale: 1 });
  return { width, height };
}

/**
 * Sizes for a first paint: page 1's, standing in for every page until
 * {@link measureAll} has the rest. A document whose first page cannot be read
 * is destroyed here, since nobody else holds it yet.
 */
export async function firstPaintSizes(doc: SizedDoc): Promise<PdfPageSize[]> {
  try {
    const first = await pageSize(doc, 1);
    return Array.from({ length: doc.numPages }, () => first);
  } catch (error) {
    void doc.loadingTask.destroy();
    throw error;
  }
}

/** Every page's own size, or `null` when none differs from `guess`. A page
 *  that cannot be read keeps its guess; rendering it reports the failure. */
export async function measureAll(
  doc: SizedDoc,
  guess: readonly PdfPageSize[],
): Promise<PdfPageSize[] | null> {
  const sizes = await Promise.all(
    guess.map((fallback, i) =>
      i === 0 ? fallback : pageSize(doc, i + 1).catch(() => fallback),
    ),
  );
  const same = sizes.every(
    (s, i) => s.width === guess[i]?.width && s.height === guess[i]?.height,
  );
  return same ? null : sizes;
}
