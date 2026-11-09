import {
  CITATION_COMMENT_MAX,
  CITATION_QUOTE_MAX,
  citationListText,
  encodeCitationsEnvelope,
  type SentCitation,
} from "@houston/wire-types";
import type { FileUpload } from "../files/types";
import type { DraftCitation } from "./types";

const PRESENTATION_RE = /\.(pptx?|odp|key)$/i;

function unitOf(fileName: string): "slide" | "page" {
  return PRESENTATION_RE.test(fileName) ? "slide" : "page";
}

/** The crop's upload name: readable in the Files tab, unique per comment. */
export function cropUploadName(citation: DraftCitation): string {
  const stem = citation.fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_");
  const unit = unitOf(citation.fileName);
  return `${stem}-${unit}${citation.page}-${citation.id.slice(0, 6)}.png`;
}

export function cropUploads(citations: readonly DraftCitation[]): FileUpload[] {
  return citations.map((c) => ({
    name: cropUploadName(c),
    contentBase64: c.cropBase64,
  }));
}

const pct = (n: number) => `${Math.round(n)}%`;

function anchorLine(c: DraftCitation): string {
  const unit = unitOf(c.fileName) === "slide" ? "Slide" : "Page";
  const where = `${unit} ${c.page} of ${c.pageCount}`;
  const what =
    c.anchor.kind === "text"
      ? `selected text "${citationListText(c.anchor.quote, CITATION_QUOTE_MAX)}"`
      : `area at x ${pct(c.anchor.box.x)}, y ${pct(c.anchor.box.y)}, ${pct(c.anchor.box.w)} wide, ${pct(c.anchor.box.h)} tall`;
  const gone = c.detached
    ? ` (this ${unit.toLowerCase()} no longer exists in the current file; the comment is about an earlier version)`
    : "";
  return `${where}, ${what}${gone}`;
}

/**
 * The model-facing list: every comment numbered as the person saw it, grouped
 * by file, each with the workspace path of its crop.
 */
export function readableCitations(
  citations: readonly DraftCitation[],
  cropPaths: readonly string[],
): string {
  const lines = [
    "[The user left comments on parts of a file. Positions are % of the page from its top-left corner. Each crop is a PNG of the region; open it with the Read tool to see what the user saw.",
  ];
  let file: string | null = null;
  citations.forEach((c, i) => {
    if (c.filePath !== file) {
      file = c.filePath;
      lines.push(`File: ${c.filePath}`);
    }
    const comment =
      citationListText(c.comment, CITATION_COMMENT_MAX) || "(no comment)";
    lines.push(`${i + 1}. ${anchorLine(c)}: ${comment}`);
    if (cropPaths[i]) lines.push(`   Crop: ${cropPaths[i]}`);
  });
  return `${lines.join("\n")}]`;
}

const QUOTE_PREVIEW = 120;

export function sentCitations(
  citations: readonly DraftCitation[],
  cropPaths: readonly string[],
): SentCitation[] {
  return citations.map((c, i) => ({
    n: i + 1,
    filePath: c.filePath,
    fileName: c.fileName,
    page: c.page,
    kind: c.anchor.kind,
    ...(c.anchor.kind === "text"
      ? { quote: c.anchor.quote.slice(0, QUOTE_PREVIEW) }
      : {}),
    comment: c.comment.trim(),
    ...(cropPaths[i] ? { cropPath: cropPaths[i] } : {}),
  }));
}

/** The typed text followed by the citations envelope, and the envelope. */
export function citedText(
  text: string,
  citations: readonly DraftCitation[],
  cropPaths: readonly string[],
): { text: string; envelope: string } {
  const envelope = encodeCitationsEnvelope(
    sentCitations(citations, cropPaths),
    readableCitations(citations, cropPaths),
  );
  const typed = text.trim();
  return { text: typed ? `${typed}\n\n${envelope}` : envelope, envelope };
}
