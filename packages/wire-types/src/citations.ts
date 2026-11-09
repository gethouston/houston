import { z } from "zod";

/**
 * Comments a person pins to a region of a previewed file (a slide, a page) and
 * sends to the agent with their next message.
 *
 * A sent message carries them twice: a model-facing list the agent reads, and a
 * hidden marker the bubble decodes into pills. Both sit inside ONE envelope, so
 * a reader that strips the envelope strips the whole thing, wherever it landed
 * (after the typed text, inside an attachment marker's message, or several
 * times over in a queue-merged send):
 *
 *   <!--houston:citations [{...}]-->
 *   [The person left comments on ...]
 *   <!--/houston:citations-->
 */

/** A rectangle on a page, in percent of the page's width and height. */
export const citationBoxSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().gt(0).max(100),
  h: z.number().gt(0).max(100),
});
export type CitationBox = z.infer<typeof citationBoxSchema>;

/** What a comment points at: selected text (its line boxes) or a drawn area. */
export const citationAnchorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    quote: z.string().trim().min(1),
    boxes: z.array(citationBoxSchema).min(1),
  }),
  z.object({ kind: z.literal("area"), box: citationBoxSchema }),
]);
export type CitationAnchor = z.infer<typeof citationAnchorSchema>;

/** One comment as the sent message's marker carries it: what a pill shows. */
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

/** The longest quote a comment keeps: past it, the crop shows the rest. */
export const CITATION_QUOTE_MAX = 300;
/** The longest comment a person can write on one region. */
export const CITATION_COMMENT_MAX = 2000;

const OPEN = "<!--houston:citations ";
const CLOSE = "<!--/houston:citations-->";
const MARKER_END = "]-->";

/** Wrap the model-facing `readable` list and its pill data in one envelope. */
export function encodeCitationsEnvelope(
  citations: readonly SentCitation[],
  readable: string,
): string {
  // No "<" or ">" may reach the marker: a quote can hold "-->" and close it
  // early, or an opener and start a second one. JSON.parse reads them back.
  const json = JSON.stringify(citations)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
  return `${OPEN}${json}-->\n${readable}\n${CLOSE}`;
}

/**
 * A quote or comment as the model-facing list prints it: on one line, within
 * `max` characters, and backslash-escaped so it can neither end its own
 * quotes, the list's brackets, nor the envelope around them.
 */
export function citationListText(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  const capped = line.length > max ? `${line.slice(0, max - 1)}…` : line;
  return capped.replace(/[\\"[\]<>]/g, (c) => `\\${c}`);
}

/**
 * Strip every envelope from `text` and collect their citations, in order.
 * `null` when there is none, so a caller can fall through to its other
 * decoders untouched. A complete envelope whose marker is malformed strips
 * but contributes no pills; an opener with no complete envelope behind it is
 * text, and stays.
 */
export function decodeCitationsEnvelopes(
  text: string,
): { text: string; citations: SentCitation[] } | null {
  // A scan, not a regex: the text is whatever the person or the model wrote,
  // and a backtracking pattern goes quadratic on many openers or newlines.
  // An envelope is the opener, a "[" marker ending at the first "]-->", then
  // everything up to the first closer, plus the newlines just before it.
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
    // No marker end or closer after this opener means none after a later one.
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
