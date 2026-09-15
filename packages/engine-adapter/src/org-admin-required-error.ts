// The "is this the gateway refusing a plain member the org-level connect?"
// classifier for the error-surfacing layer. Dependency-free so it is
// node-testable directly (app/tests/org-admin-required-error.test.ts) and
// importable from anywhere; it lives in the engine adapter for the same reason
// `engine-waking-error.ts` does (the adapter is bundled by the desktop app,
// which cannot resolve `@houston/app/*`). app/src/lib/org-admin-required-error.ts
// re-exports it for the app's own call sites.
//
// Before any agent exists for the caller, every provider connect (OAuth
// launch, api-key paste, credential capture) routes through the gateway's
// hidden SETUP runtime, whose POSTs land the credential on the organization's
// central store. The gateway deliberately reserves that for owners and admins
// (`cloud/internal/edge/setupruntime/routes.go`): a plain `user` in a shared
// org is answered `403 {"error": "only an org owner or admin can connect the
// organization's AI subscription"}` before the pod is even touched. That is
// an EXPECTED business state — nothing in Houston broke — so the surfacing
// layer routes it to a plain informational toast, never the red bug pipeline
// (HOUSTON-APP-597 / HOUSTON-APP-55X captured it as a bug per attempt).
//
// The gateway sends the sentence only (no `code`), so this matches on the
// (403, reason prefix) pair across the client stacks that reach it — the same
// three shapes `engine-waking-error.ts` documents:
//  - `HoustonEngineError`: message is `"<reason> (engine error 403)"`.
//  - `EngineError` (`@houston/runtime-client`, the setup-runtime client the
//    OAuth launch uses): raw JSON body in `body`.
//  - `AgentsHttpError`: raw JSON body as the message.

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

/**
 * A gateway "only an owner or admin can connect the organization's AI" 403:
 * a plain member tried the org-level (pre-agent) connect. Matched structurally
 * (name + status + reason prefix) so this stays dependency-free.
 */
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
