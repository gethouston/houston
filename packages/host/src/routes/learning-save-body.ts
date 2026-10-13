/**
 * The body of a learning save, parsed the SAME way by both save handlers (the
 * host route and a pooled turn's own), so one bad body gets one 400 message
 * wherever the turn runs: the text first, then `replaces`.
 */
export interface LearningSaveBody {
  text: string;
  replaces?: string[];
}

export function parseLearningSaveBody(
  body: Record<string, unknown>,
): LearningSaveBody | { error: string } {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return { error: "missing 'text'" };
  const replaces = parseReplaces(body);
  if ("error" in replaces) return replaces;
  return { text, ...replaces };
}

/** The most refs one save may archive. */
export const MAX_REPLACES = 50;

/** The optional `replaces` field: at most {@link MAX_REPLACES} non-empty ids. */
export function parseReplaces(
  body: Record<string, unknown>,
): { replaces?: string[] } | { error: string } {
  const raw = body.replaces;
  if (raw === undefined || raw === null) return {};
  if (
    !Array.isArray(raw) ||
    raw.length > MAX_REPLACES ||
    !raw.every((ref) => typeof ref === "string" && ref.trim() !== "")
  ) {
    return {
      error: `'replaces' must be an array of at most ${MAX_REPLACES} memory ids (non-empty strings)`,
    };
  }
  return raw.length ? { replaces: raw.map((ref: string) => ref.trim()) } : {};
}
