export function canonicalJSON(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
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

export function unknownFamilyRejection(
  status: number,
  detail: string,
): boolean {
  return status === 400 && detail.includes("invalid document family");
}
