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
  fileName: z.string().min(1),
  page: z.number().int().positive(),
  kind: z.enum(["text", "area"]),
  quote: z.string().optional(),
  comment: z.string(),
  cropPath: z.string().optional(),
});
export type SentCitation = z.infer<typeof sentCitationSchema>;

const OPEN = "<!--houston:citations ";
const CLOSE = "<!--/houston:citations-->";
const ENVELOPE_RE =
  /\n*<!--houston:citations (\[[\s\S]*?\])-->[\s\S]*?<!--\/houston:citations-->/g;

/** Wrap the model-facing `readable` list and its pill data in one envelope. */
export function encodeCitationsEnvelope(
  citations: readonly SentCitation[],
  readable: string,
): string {
  // No ">" may reach the marker: a quote can hold "-->" and close it early.
  // JSON.parse reads the escape back as ">".
  const json = JSON.stringify(citations).replace(/>/g, "\\u003e");
  return `${OPEN}${json}-->\n${readable}\n${CLOSE}`;
}

/**
 * Strip every envelope from `text` and collect their citations, in order.
 * `null` when there is none, so a caller can fall through to its other
 * decoders untouched. A malformed marker strips but contributes no pills.
 */
export function decodeCitationsEnvelopes(
  text: string,
): { text: string; citations: SentCitation[] } | null {
  if (!text.includes(OPEN)) return null;
  const citations: SentCitation[] = [];
  let found = false;
  const stripped = text.replace(ENVELOPE_RE, (_all, json: string) => {
    found = true;
    const parsed = z.array(sentCitationSchema).safeParse(safeJson(json));
    if (parsed.success) citations.push(...parsed.data);
    return "";
  });
  return found ? { text: stripped.trim(), citations } : null;
}

function safeJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
