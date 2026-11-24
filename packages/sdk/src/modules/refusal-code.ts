/**
 * The machine-readable `code` a failed request answered with, wherever the
 * error carries the body: the adapter's `HoustonEngineError` holds it parsed
 * on `body`, the SDK's own `*HttpError`s hold the response text as their
 * message. Refusal classifiers read the code through here, so a state is
 * recognized the same way whichever stack threw it.
 */
export function refusalCode(error: Error): string | null {
  const { body } = error as { body?: unknown };
  return codeOf(body === undefined ? error.message : body);
}

function codeOf(body: unknown): string | null {
  if (typeof body === "string") {
    try {
      return codeOf(JSON.parse(body));
    } catch {
      return null;
    }
  }
  if (typeof body !== "object" || body === null) return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/** The upstream HTTP status an error carries, or null when it has none. */
export function refusalStatus(error: Error): number | null {
  const { status } = error as { status?: unknown };
  return typeof status === "number" ? status : null;
}
