import type {
  PdfDocumentHandle,
  PdfMark,
  PdfPagesHandle,
} from "@houston-ai/pdf";
import { type RefObject, useEffect, useRef } from "react";
import { useCitationFocus } from "../../stores/citation-focus";

/**
 * Where the pages land: on the page a sent comment's pill named, once per
 * opening, and on a mark whenever its composer chip is pressed (a request
 * made while the document was still loading lands once it is ready).
 */
export function usePdfLanding(
  pages: RefObject<PdfPagesHandle | null>,
  handle: PdfDocumentHandle | null,
  filePath: string,
  page: number | undefined,
  marks: readonly PdfMark[],
) {
  const landed = useRef<string | null>(null);
  useEffect(() => {
    const key = `${filePath}#${page ?? 1}`;
    if (!handle || landed.current === key) return;
    landed.current = key;
    if (page) pages.current?.scrollToPage(page, { smooth: false });
  }, [pages, handle, filePath, page]);

  const reveal = useCitationFocus((s) => s.reveal);
  const revealed = useRef(reveal?.nonce ?? 0);
  useEffect(() => {
    if (!handle || !reveal || reveal.nonce === revealed.current) return;
    if (!marks.some((m) => m.id === reveal.id)) return;
    revealed.current = reveal.nonce;
    pages.current?.revealMark(reveal.id);
  }, [pages, handle, reveal, marks]);
}
