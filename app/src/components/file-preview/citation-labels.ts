import type { DraftCitation } from "@houston/sdk";
import type { SentCitation } from "@houston/wire-types";
import type { CitationChipData } from "@houston-ai/chat";
import type { TFunction } from "i18next";

const PRESENTATION_RE = /\.(pptx?|odp|key)$/i;

/** Slides for decks, pages for everything else. */
export function isPresentation(fileName: string): boolean {
  return PRESENTATION_RE.test(fileName);
}

type T = TFunction<"agents">;

/** "Slide 3" / "Page 3", in the reader's language. */
export function pageName(t: T, fileName: string, page: number): string {
  return isPresentation(fileName)
    ? t("files.preview.comments.slide", { page })
    : t("files.preview.comments.page", { page });
}

const QUOTE_MAX = 60;

/** Where a comment points: "Slide 3 · “quote”" or "Slide 5 · Selected area". */
export function citationContext(
  t: T,
  c: { fileName: string; page: number; quote?: string },
): string {
  const where = pageName(t, c.fileName, c.page);
  if (!c.quote) return `${where} · ${t("files.preview.comments.area")}`;
  const quote =
    c.quote.length > QUOTE_MAX ? `${c.quote.slice(0, QUOTE_MAX)}…` : c.quote;
  return `${where} · “${quote}”`;
}

export function draftChip(t: T, c: DraftCitation, n: number): CitationChipData {
  return {
    id: c.id,
    n,
    context: citationContext(t, {
      fileName: c.fileName,
      page: c.page,
      quote: c.anchor.kind === "text" ? c.anchor.quote : undefined,
    }),
    comment: c.comment,
    thumbnailSrc: c.cropBase64
      ? `data:image/png;base64,${c.cropBase64}`
      : undefined,
    warning: c.detached
      ? t("files.preview.comments.detached", {
          where: pageName(t, c.fileName, c.page),
        })
      : undefined,
  };
}

/** A sent message's pills, one group per file. Two files can share a name
 *  in different folders, so the path keys the group. */
export function sentPillGroups(
  t: T,
  citations: readonly SentCitation[],
  thumbnails: readonly (string | undefined)[],
): { filePath: string; fileName: string; citations: CitationChipData[] }[] {
  const byFile = new Map<
    string,
    { filePath: string; fileName: string; citations: CitationChipData[] }
  >();
  citations.forEach((c, i) => {
    const group = byFile.get(c.filePath) ?? {
      filePath: c.filePath,
      fileName: c.fileName,
      citations: [],
    };
    group.citations.push({
      id: String(i),
      n: c.n,
      context: citationContext(t, c),
      comment: c.comment,
      thumbnailSrc: thumbnails[i],
    });
    byFile.set(c.filePath, group);
  });
  return [...byFile.values()];
}
