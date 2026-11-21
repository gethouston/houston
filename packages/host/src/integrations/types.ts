export interface Toolkit {
  slug: string;
  name: string;
  description?: string;
  logoUrl?: string;
  categories?: string[];
  noAuth?: boolean;
}

export interface Connection {
  toolkit: string;
  connectionId: string;
  status: "active" | "pending" | "error";
  accountLabel?: string;
  createdAt?: string;
}

export interface ConnectedAccount {
  id: string;
  label?: string;
  createdAt?: string;
}

export interface ConnectStart {
  redirectUrl: string;
  connectionId: string;
}

export const INTEGRATION_APP_STATUSES = [
  "connected",
  "connectable",
  "blocked",
  "unknown",
] as const;
export type IntegrationAppStatus = (typeof INTEGRATION_APP_STATUSES)[number];

export function isIntegrationAppStatus(v: unknown): v is IntegrationAppStatus {
  return (
    typeof v === "string" &&
    (INTEGRATION_APP_STATUSES as readonly string[]).includes(v)
  );
}

export function statusFromConnected(connected?: boolean): IntegrationAppStatus {
  return connected === true ? "connected" : "connectable";
}

export interface ToolMatch {
  action: string;
  toolkit: string;
  description: string;
  inputParams?: unknown;
  connected?: boolean;
  status?: IntegrationAppStatus;
  accounts?: ConnectedAccount[];
}

export interface ActionResult {
  successful: boolean;
  data?: unknown;
  error?: string;
}

export interface ProviderReadiness {
  ready: boolean;
  reason?: "signin";
}

export class IntegrationSigninRequiredError extends Error {
  constructor() {
    super("sign in to Houston to use integrations");
    this.name = "IntegrationSigninRequiredError";
  }
}

export class IntegrationUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `integrations upstream returned ${status}`);
    this.name = "IntegrationUpstreamError";
  }
}

function parseJsonOrRaw(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function integrationUpstreamErrorFromResponse(
  res: Response,
  context: string,
): Promise<IntegrationUpstreamError> {
  const raw = await res.text();
  const body = raw
    ? res.headers.get("content-type")?.includes("json")
      ? parseJsonOrRaw(raw)
      : raw
    : { error: `integrations upstream returned ${res.status}` };
  return new IntegrationUpstreamError(
    res.status,
    body,
    `${context} → ${res.status}${raw ? `: ${raw.slice(0, 300)}` : ""}`,
  );
}
