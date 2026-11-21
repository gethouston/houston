import { isUnauthorized } from "../../auth-expiry";
import { isTransportFailure } from "../../transport-failure";

export class WorkspacePreferenceTimeout extends Error {
  constructor() {
    super("Workspace preference request timed out");
    this.name = "WorkspacePreferenceTimeout";
  }
}

export class WorkspacePreferenceIdentityChanged extends Error {
  constructor() {
    super("Workspace preference identity changed");
    this.name = "WorkspacePreferenceIdentityChanged";
  }
}

export class WorkspacePreferenceUnavailable extends Error {
  constructor(
    readonly operation: "read",
    readonly fallback: string | null,
    cause: unknown,
  ) {
    super(`Workspace preference ${operation} unavailable`, { cause });
    this.name = "WorkspacePreferenceUnavailable";
  }
}

export function isWorkspacePreferenceConnectivity(error: unknown): boolean {
  return (
    error instanceof WorkspacePreferenceTimeout ||
    isTransportFailure(error) ||
    (error instanceof Error &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status >= 500 &&
      error.status < 600)
  );
}

export function workspacePreferenceErrorKind(
  error: unknown,
): "signed_out" | "identity_changed" | "connectivity" | "unexpected" {
  if (isUnauthorized(error)) return "signed_out";
  if (error instanceof WorkspacePreferenceIdentityChanged)
    return "identity_changed";
  if (isWorkspacePreferenceConnectivity(error)) return "connectivity";
  return "unexpected";
}
