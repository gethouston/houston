/**
 * Fitting text to the share card's widths. Pure: it only needs something
 * that measures (the canvas context, or a fake in tests). Text is cut and
 * wrapped on `Intl.Segmenter` boundaries, so a family or skin-tone emoji is
 * never split before the ellipsis, accents stay on their letters, and CJK
 * (which has no spaces) still wraps between words.
 */

export interface Measurer {
  measureText(text: string): { width: number };
  font: string;
}

export const FONT =
  'ui-sans-serif, -apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif';

const ELLIPSIS = "\u2026";

type SegmenterCtor = new (
  locale?: string,
  options?: { granularity: "grapheme" | "word" },
) => { segment(text: string): Iterable<{ segment: string }> };

const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;

/** User-perceived characters; code points where Segmenter is missing. */
export function graphemes(text: string): string[] {
  if (!Segmenter) return [...text];
  const segmenter = new Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/** Words and the spaces between them, in order; CJK yields one per word. */
function wordSegments(text: string): string[] {
  if (!Segmenter) return text.split(/(\s+)/).filter(Boolean);
  const segmenter = new Segmenter(undefined, { granularity: "word" });
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

const fits = (ctx: Measurer, text: string, max: number) =>
  ctx.measureText(text).width <= max;

/** Text cut with an ellipsis to fit `max` at the current font. */
export function fitText(ctx: Measurer, text: string, max: number): string {
  if (fits(ctx, text, max)) return text;
  const chars = graphemes(text);
  while (chars.length > 1) {
    chars.pop();
    const cut = `${chars.join("").trimEnd()}${ELLIPSIS}`;
    if (fits(ctx, cut, max)) return cut;
  }
  return ELLIPSIS;
}

/**
 * `text` broken between words into at most `maxLines` lines that fit `max`
 * at the current font, the last cut with an ellipsis if it still runs on.
 */
export function wrapLines(
  ctx: Measurer,
  text: string,
  max: number,
  maxLines: number,
): string[] {
  if (fits(ctx, text, max) || maxLines <= 1) return [fitText(ctx, text, max)];
  const segments = wordSegments(text);
  const lines: string[] = [];
  let line = "";
  for (const [index, segment] of segments.entries()) {
    const next = line + segment;
    if (fits(ctx, next.trimEnd(), max) || !line.trim()) {
      line = next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      line += segments.slice(index).join("");
      break;
    }
    lines.push(line.trim());
    line = segment.trimStart();
  }
  lines.push(line.trim());
  return lines.map((l) => fitText(ctx, l, max));
}

/** The largest size (down to `min`) at which `text` fits on one line. */
export function fitFontSize(
  ctx: Measurer,
  text: string,
  max: number,
  weight: number,
  from: number,
  min: number,
): number {
  for (let size = from; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (fits(ctx, text, max)) return size;
  }
  return min;
}
