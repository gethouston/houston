const ORG_ADMIN_REQUIRED_403 = "only an org owner or admin can connect";

function gatewayReason(body: string): string | null {
  if (!body.startsWith("{")) return null;
  try {
    const reason = (JSON.parse(body) as { error?: unknown } | null)?.error;
    return typeof reason === "string" ? reason : null;
  } catch {
    return null;
  }
}

function bodyReason(body: unknown): string | null {
  if (typeof body === "string") return gatewayReason(body);
  const reason = (body as { error?: unknown } | null)?.error;
  return typeof reason === "string" ? reason : null;
}

export function isOrgAdminRequiredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if ((err as { status?: unknown }).status !== 403) return false;
  if (err.name === "HoustonEngineError") {
    return (
      err.message.startsWith(ORG_ADMIN_REQUIRED_403) ||
      (bodyReason((err as { body?: unknown }).body)?.startsWith(
        ORG_ADMIN_REQUIRED_403,
      ) ??
        false)
    );
  }
  if (err.name === "AgentsHttpError") {
    return (
      gatewayReason(err.message)?.startsWith(ORG_ADMIN_REQUIRED_403) ?? false
    );
  }
  if (err.name === "EngineError") {
    return (
      bodyReason((err as { body?: unknown }).body)?.startsWith(
        ORG_ADMIN_REQUIRED_403,
      ) ?? false
    );
  }
  return false;
}
