/**
 * Typed non-2xx from the runtime's fire-turn POST, so callers branch on the
 * runtime's verdict instead of parsing a flat "runtime 409: {...}" string.
 * `code` is the runtime's machine-readable reason when its JSON body carried
 * one (e.g. "no_provider" from the 409 provider gate) — the scheduler uses it
 * to tell an expected user state apart from a real failure.
 */
export class TurnFireError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "TurnFireError";
  }
}

/** The `code` field of a runtime error body, when the body is JSON with one. */
export function errorCodeFrom(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "code" in parsed) {
      const code = (parsed as { code: unknown }).code;
      if (typeof code === "string" && code) return code;
    }
  } catch {
    // Not JSON — an HTML error page, a bare string. No code to extract; the
    // caller still gets the verbatim body in the error message.
  }
  return null;
}
