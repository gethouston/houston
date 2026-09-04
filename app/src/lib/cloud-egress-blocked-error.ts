// The "is this the managed cloud host refusing an unreachable local-model
// address?" classifier for the error-surfacing layer. Dependency-free so it is
// node-testable directly (app/tests/cloud-egress-blocked-error.test.ts).
//
// A cloud agent pod egresses ONLY to public TCP 443, so the host rejects a
// custom OpenAI-compatible base URL that targets plain http, a custom port, or
// a private/loopback host at save time with a deliberate 400
// (`packages/host/src/custom-endpoint-validation.ts`). That is an EXPECTED
// state the user can act on, not a Houston bug: the manual-connect form renders
// rule-specific translated guidance inline, every other caller gets a plain
// info toast, and nothing reaches Sentry. Before this classifier the 400 went
// through the generic "something went wrong" path AND filed a Sentry issue per
// attempt (HOUSTON-APP-56A).
//
// The host sends a typed `code` alongside the English `error` sentence. An
// older host sends only the sentence, which always opens with the same
// throughline; that still classifies (as `unspecified`) so the state is never
// reported as a bug, just with less specific copy.

/** Which egress rule the address broke; `unspecified` = code-less older host. */
export type CloudEgressRejection =
  | "not_https"
  | "custom_port"
  | "private_host"
  | "unspecified";

const CODE_TO_REJECTION: Record<string, CloudEgressRejection> = {
  endpoint_not_https: "not_https",
  endpoint_custom_port: "custom_port",
  endpoint_private_host: "private_host",
};

/** The one throughline every host rejection reason opens with. */
const CLOUD_ONLY_PREFIX =
  "Cloud agents can only reach public HTTPS endpoints on port 443.";

type ErrorBody = { error?: unknown; code?: unknown };

function parsedBody(body: unknown): ErrorBody | null {
  if (typeof body === "string") {
    if (!body.startsWith("{")) return null;
    try {
      return JSON.parse(body) as ErrorBody;
    } catch {
      return null;
    }
  }
  return body && typeof body === "object" ? (body as ErrorBody) : null;
}

/**
 * The egress rule a `set_provider_custom_endpoint` 400 names, or null for any
 * other error. Matched structurally (status + body code, then the reason
 * throughline) so it stays dependency-free across the client error shapes.
 */
export function classifyCloudEgressRejection(
  err: unknown,
): CloudEgressRejection | null {
  if (!(err instanceof Error)) return null;
  if ((err as { status?: unknown }).status !== 400) return null;
  const body = parsedBody((err as { body?: unknown }).body);
  const code = typeof body?.code === "string" ? body.code : undefined;
  const byCode = code === undefined ? undefined : CODE_TO_REJECTION[code];
  if (byCode) return byCode;
  const reason = typeof body?.error === "string" ? body.error : err.message;
  return reason.startsWith(CLOUD_ONLY_PREFIX) ? "unspecified" : null;
}

/** True when `err` is the cloud egress rejection (any rule). */
export function isCloudEgressBlockedError(err: unknown): boolean {
  return classifyCloudEgressRejection(err) !== null;
}

/** The `providers` namespace key holding the guidance for a rejection. */
export function cloudEgressBodyKey(
  rejection: CloudEgressRejection,
): `openaiCompatible.cloudOnly.${"notHttps" | "customPort" | "privateHost" | "unspecified"}` {
  switch (rejection) {
    case "not_https":
      return "openaiCompatible.cloudOnly.notHttps";
    case "custom_port":
      return "openaiCompatible.cloudOnly.customPort";
    case "private_host":
      return "openaiCompatible.cloudOnly.privateHost";
    case "unspecified":
      return "openaiCompatible.cloudOnly.unspecified";
  }
}
