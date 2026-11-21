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

export function isCloudEgressBlockedError(err: unknown): boolean {
  return classifyCloudEgressRejection(err) !== null;
}

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
