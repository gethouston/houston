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

export function refusalStatus(error: Error): number | null {
  const { status } = error as { status?: unknown };
  return typeof status === "number" ? status : null;
}
