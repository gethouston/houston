/** Stable stringify (recursive key sort) so jsonb's key reordering never
 *  reads as a content change. */
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    // Null prototype: a parsed "__proto__" key must land as an own property,
    // not vanish into the prototype setter (else two docs differing only in
    // that key compare equal and a required PUT is skipped).
    const out: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function etagRevision(response: Response): number | undefined {
  const etag = response.headers
    .get("ETag")
    ?.replace(/^W\//, "")
    .replaceAll('"', "");
  return etag && Number.isSafeInteger(Number(etag)) ? Number(etag) : undefined;
}

/** Parse a doc GET body. A non-empty body that is not JSON is a protocol
 *  fault and THROWS (fail the seed loudly) — treating it as revision 0 would
 *  mask gateway corruption and follow up with a blind PUT. */
export function parseDocBody(text: string): {
  revision?: number;
  doc?: unknown;
} {
  if (!text) return {};
  const body = JSON.parse(text) as { revision?: unknown; doc?: unknown };
  return {
    ...(typeof body.revision === "number" ? { revision: body.revision } : {}),
    ...("doc" in body ? { doc: body.doc } : {}),
  };
}

export async function responseRevision(
  response: Response,
): Promise<number | undefined> {
  const etag = etagRevision(response);
  if (etag !== undefined) return etag;
  const text = await response.text();
  if (!text) return undefined;
  try {
    const body = JSON.parse(text) as { revision?: unknown };
    return typeof body.revision === "number" ? body.revision : undefined;
  } catch (error) {
    console.debug("[doc-shadow] response carried no revision", error);
    return undefined;
  }
}

export async function responseError(
  response: Response,
  family: string,
  method: string,
): Promise<Error> {
  const detail = await response.text();
  return new Error(
    `doc shadow ${method} ${family} failed (${response.status}): ${detail.slice(0, 300)}`,
  );
}
