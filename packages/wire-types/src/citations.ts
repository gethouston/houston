import { z } from "zod";

export const citationBoxSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().gt(0).max(100),
  h: z.number().gt(0).max(100),
});
export type CitationBox = z.infer<typeof citationBoxSchema>;

export const citationAnchorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    quote: z.string().trim().min(1),
    boxes: z.array(citationBoxSchema).min(1),
  }),
  z.object({ kind: z.literal("area"), box: citationBoxSchema }),
]);
export type CitationAnchor = z.infer<typeof citationAnchorSchema>;

export const sentCitationSchema = z.object({
  n: z.number().int().positive(),
  filePath: z.string().min(1),
  fileName: z.string().min(1),
  page: z.number().int().positive(),
  kind: z.enum(["text", "area"]),
  quote: z.string().optional(),
  comment: z.string(),
  cropPath: z.string().optional(),
});
export type SentCitation = z.infer<typeof sentCitationSchema>;

export const CITATION_QUOTE_MAX = 300;
export const CITATION_COMMENT_MAX = 2000;

const OPEN = "<!--houston:citations ";
const CLOSE = "<!--/houston:citations-->";
const MARKER_END = "]-->";

export function encodeCitationsEnvelope(
  citations: readonly SentCitation[],
  readable: string,
): string {
  const json = JSON.stringify(citations)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
  return `${OPEN}${json}-->\n${readable}\n${CLOSE}`;
}

export function citationListText(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  const capped = line.length > max ? `${line.slice(0, max - 1)}…` : line;
  return capped.replace(/[\\"[\]<>]/g, (c) => `\\${c}`);
}

export function decodeCitationsEnvelopes(
  text: string,
): { text: string; citations: SentCitation[] } | null {
  const citations: SentCitation[] = [];
  let stripped = "";
  let from = 0;
  let found = false;
  let at = text.indexOf(OPEN);
  while (at !== -1) {
    const jsonStart = at + OPEN.length;
    if (text[jsonStart] !== "[") {
      at = text.indexOf(OPEN, jsonStart);
      continue;
    }
    const markerEnd = text.indexOf(MARKER_END, jsonStart + 1);
    if (markerEnd === -1) break;
    const close = text.indexOf(CLOSE, markerEnd + MARKER_END.length);
    if (close === -1) break;
    let start = at;
    while (start > from && text[start - 1] === "\n") start--;
    stripped += text.slice(from, start);
    found = true;
    const json = text.slice(jsonStart, markerEnd + 1);
    const parsed = z.array(sentCitationSchema).safeParse(safeJson(json));
    if (parsed.success) citations.push(...parsed.data);
    from = close + CLOSE.length;
    at = text.indexOf(OPEN, from);
  }
  if (!found) return null;
  return { text: (stripped + text.slice(from)).trim(), citations };
}

function safeJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
