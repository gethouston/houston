/**
 * Quick machine translation for installed skills (HOU-733) — the free,
 * no-provider-needed mode of the post-install translate offer. Uses Google's
 * public gtx endpoint (the same one the popular translate js packages wrap)
 * via plain fetch, so no dependency rides into the bun-compiled sidecar.
 *
 * Markdown-aware: fenced code blocks (indented ones included) are never sent
 * to the translator — the text is split on fences and only the prose chunks
 * travel. Long prose is chunked on blank lines (hard-split as a last resort)
 * to stay inside the endpoint's request size. Quality is machine-translation
 * quality by design; the UI offers the AI mode for a better result.
 */

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";
/** Keep each request comfortably under the endpoint's size limits. */
const MAX_CHUNK = 1800;

export type TextTranslator = (
  texts: string[],
  targetLanguage: string,
) => Promise<string[]>;

/** Split markdown into alternating prose/code chunks; code never travels. */
export function splitTranslatableChunks(
  text: string,
): { text: string; translate: boolean }[] {
  const chunks: { text: string; translate: boolean }[] = [];
  // Fences may be indented (list-nested code blocks are common in skill
  // procedures); the closing fence's indentation may differ from the opener's.
  const fence = /^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[^\n]*$/gm;
  let last = 0;
  for (const m of text.matchAll(fence)) {
    if (m.index > last)
      chunks.push({ text: text.slice(last, m.index), translate: true });
    chunks.push({ text: m[0], translate: false });
    last = m.index + m[0].length;
  }
  if (last < text.length)
    chunks.push({ text: text.slice(last), translate: true });
  return chunks;
}

/**
 * Split prose on blank lines into pieces of at most `max` characters. A
 * single block longer than `max` (a big table, one huge paragraph) is
 * hard-split on line breaks, then raw length, so no piece can exceed the
 * endpoint's request size.
 */
export function chunkProse(text: string, max = MAX_CHUNK): string[] {
  if (text.length <= max) return [text];
  const pieces: string[] = [];
  let current = "";
  const push = (part: string) => {
    if (current && current.length + part.length > max) {
      pieces.push(current);
      current = part;
    } else {
      current += part;
    }
  };
  for (const part of text.split(/(\n\s*\n)/)) {
    if (part.length <= max) {
      push(part);
      continue;
    }
    for (const line of part.split(/(\n)/)) {
      if (line.length <= max) {
        push(line);
        continue;
      }
      for (let i = 0; i < line.length; i += max) push(line.slice(i, i + max));
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Parse the gtx response: `[[["translated","source",…],…],…]`. */
function parseGtx(body: unknown): string {
  if (!Array.isArray(body) || !Array.isArray(body[0])) {
    throw new Error("translation service returned an unexpected response");
  }
  let out = "";
  for (const seg of body[0]) {
    if (Array.isArray(seg) && typeof seg[0] === "string") out += seg[0];
  }
  return out;
}

async function translateChunk(
  text: string,
  targetLanguage: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  // gtx normalizes surrounding whitespace, but the newlines separating prose
  // from an adjacent code fence are structural markdown — translate the core
  // and re-attach the original margins so fences stay at line starts.
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const core = text.slice(lead.length).trimEnd();
  const trail = text.slice(lead.length + core.length);
  if (!core) return text;
  const res = await fetchImpl(
    `${ENDPOINT}?client=gtx&sl=auto&tl=${encodeURIComponent(targetLanguage)}&dt=t`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `q=${encodeURIComponent(core)}`,
    },
  );
  if (!res.ok) {
    throw new Error(
      `translation service answered ${res.status}${res.status === 429 ? " (rate limited, try again in a moment)" : ""}`,
    );
  }
  return lead + parseGtx(await res.json()).trimEnd() + trail;
}

/**
 * Machine-translate the given texts. Code fences inside each text are
 * preserved verbatim; everything else goes through the translator. Requests
 * run sequentially on purpose — the free endpoint rate-limits bursts. Throws
 * with the real reason on any failure — the user asked for this translation.
 */
export async function machineTranslate(
  texts: string[],
  targetLanguage: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const out: string[] = [];
  for (const text of texts) {
    let translated = "";
    for (const chunk of splitTranslatableChunks(text)) {
      if (!chunk.translate) {
        translated += chunk.text;
        continue;
      }
      for (const piece of chunkProse(chunk.text)) {
        translated += await translateChunk(piece, targetLanguage, fetchImpl);
      }
    }
    out.push(translated);
  }
  return out;
}
