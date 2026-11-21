const NO_ACTIVE_LOGIN = "no active login";

function runtimeReason(body: unknown): string | null {
  if (typeof body !== "string" || !body.startsWith("{")) return null;
  try {
    const reason = (JSON.parse(body) as { error?: unknown } | null)?.error;
    return typeof reason === "string" ? reason : null;
  } catch {
    return null;
  }
}

export function isProviderLoginSessionLostError(err: unknown): boolean {
  if (!(err instanceof Error) || err.name !== "EngineError") return false;
  if ((err as { status?: unknown }).status !== 400) return false;
  const reason = runtimeReason((err as { body?: unknown }).body);
  return reason?.startsWith(NO_ACTIVE_LOGIN) ?? false;
}
