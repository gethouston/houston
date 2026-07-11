/**
 * Parsing for the anonymize one-shot response. The model returns
 * `{"items":[{"id","text","summary"}]}`; every requested id must come back
 * exactly once (a dropped item would silently ship unredacted content, so a
 * missing id is a hard error). Extra/unknown ids are ignored.
 */

export interface AnonymizeItemInput {
  id: string;
  text: string;
}

export interface AnonymizeItemResult {
  id: string;
  text: string;
  summary: string;
}

export function parseAnonymizeResult(
  raw: string,
  requested: AnonymizeItemInput[],
): AnonymizeItemResult[] {
  const cleaned = raw
    .trim()
    .replace(/^```json/, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  let v: unknown;
  try {
    v = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const items = (v as { items?: unknown })?.items;
  if (!Array.isArray(items)) {
    throw new Error("model reply is missing the 'items' array");
  }

  const byId = new Map<string, AnonymizeItemResult>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const { id, text, summary } = item as Record<string, unknown>;
    if (typeof id !== "string" || typeof text !== "string") continue;
    byId.set(id, {
      id,
      text,
      summary: typeof summary === "string" ? summary : "",
    });
  }

  return requested.map((input) => {
    const result = byId.get(input.id);
    if (!result) {
      throw new Error(`model reply is missing item '${input.id}'`);
    }
    return result;
  });
}
