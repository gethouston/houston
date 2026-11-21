import type { TurnGrant, TurnGrantScope } from "./types";

export function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid '${field}'`);
  }
  return value as Record<string, unknown>;
}

export function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error(`invalid '${field}'`);
  }
}

export function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const GRANT_SCOPES: readonly TurnGrantScope[] = [
  "integrations",
  "agent-writes",
  "code-run",
  "browser-live",
];

export function parseGrant(value: unknown): TurnGrant {
  const grant = record(value, "grant");
  exactKeys(grant, ["url", "token", "expires", "scopes"], "grant");
  if (
    !nonEmpty(grant.url) ||
    !nonEmpty(grant.token) ||
    typeof grant.expires !== "number" ||
    !Number.isSafeInteger(grant.expires) ||
    grant.expires <= 0 ||
    !Array.isArray(grant.scopes)
  ) {
    throw new Error("invalid 'grant'");
  }
  let origin: URL;
  try {
    origin = new URL(grant.url);
  } catch {
    throw new Error("invalid 'grant'");
  }
  if (
    (origin.protocol !== "http:" && origin.protocol !== "https:") ||
    origin.username !== "" ||
    origin.password !== "" ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== ""
  ) {
    throw new Error("invalid 'grant'");
  }
  return {
    url: origin.origin,
    token: grant.token,
    expires: grant.expires,
    scopes: grant.scopes.filter(
      (scope): scope is TurnGrantScope =>
        typeof scope === "string" &&
        GRANT_SCOPES.includes(scope as TurnGrantScope),
    ),
  };
}
