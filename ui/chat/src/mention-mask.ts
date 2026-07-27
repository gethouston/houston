/**
 * Blanking the markdown constructs a mention can hide inside (HOU-944).
 *
 * The renderer walks the PARSED tree and refuses to chip inside `code`, `pre`
 * or `a`. The send path only ever sees the raw text, so without this pass an
 * "@Name" written inside a code span, a fenced block or a link would record a
 * mention the reader never sees — someone gets notified about a message that
 * addresses nobody.
 *
 * Every masked character is replaced ONE FOR ONE (newlines survive as
 * themselves), so offsets into the masked string still index the original.
 * Pure, no React.
 *
 * WHAT STILL DIVERGES, honestly. This is a lexical pass, not a markdown
 * parser, so a few constructs the real renderer treats as verbatim are not
 * caught: indented (four-space) code blocks, reference-style links
 * (`[label][ref]`), bare autolinks (`<https://…/@name>`), raw HTML `<code>`
 * elements, and mentions inside a block quote of a code fence. In each of
 * those a send may still record a mention the transcript shows as plain text.
 * The failure is a notification with no chip, never a lost message; widening
 * the net further means parsing markdown twice, which is the renderer's job.
 */

/** The stand-in for a masked character. A SPACE, deliberately: the renderer
 *  parses a code span or a link into a node of its own, so the text right
 *  after one begins a FRESH text node, where an "@" sits at index 0 and does
 *  start a mention. Blanking to whitespace reproduces exactly that. */
const MASK = " ";

/** Fenced code, inline code and inline links, blanked out. */
export function maskMarkdown(text: string): string {
  const chars = text.split("");
  maskFences(text, chars);
  // Inline constructs are matched against the FENCE-MASKED text so a stray
  // backtick or bracket inside a code block can never pair with a real one
  // outside it.
  maskPattern(chars.join(""), chars, /(`+)[\s\S]*?\1/g);
  maskPattern(chars.join(""), chars, /!?\[[^\]\n]*\]\([^)\n]*\)/g);
  return chars.join("");
}

/** ```/~~~ blocks, opening fence through closing fence. An unterminated fence
 *  masks to the end of the text, which is how a renderer treats it too. */
function maskFences(text: string, chars: string[]): void {
  let offset = 0;
  let fence: string | null = null;
  let blockStart = 0;
  for (const line of text.split("\n")) {
    const marker = /^(`{3,}|~{3,})/.exec(line.trimStart())?.[1]?.[0];
    if (fence === null) {
      if (marker) {
        fence = marker;
        blockStart = offset;
      }
    } else if (marker === fence) {
      maskRange(chars, blockStart, offset + line.length);
      fence = null;
    }
    offset += line.length + 1;
  }
  if (fence !== null) maskRange(chars, blockStart, text.length);
}

function maskPattern(source: string, chars: string[], pattern: RegExp): void {
  for (const match of source.matchAll(pattern)) {
    maskRange(chars, match.index, match.index + match[0].length);
  }
}

function maskRange(chars: string[], start: number, end: number): void {
  for (let i = start; i < end; i += 1) {
    if (chars[i] !== "\n") chars[i] = MASK;
  }
}
