export { isBridgeUnsupported } from "./unsupported";

export class BridgeStateError extends Error {
  constructor(
    readonly status:
      | "model_unavailable"
      | "revoked"
      | "authorization_required"
      | "reconnect_required"
      | "reconnecting",
  ) {
    super(status);
  }
}
export function isAuthorizationFailure(error: unknown) {
  if (error instanceof BridgeStateError)
    return (
      error.status === "authorization_required" || error.status === "revoked"
    );
  if (typeof error !== "object" || error === null) return false;
  return (
    ("status" in error && (error.status === 401 || error.status === 403)) ||
    ("code" in error &&
      [
        "unauthorized",
        "forbidden",
        "revoked",
        "not_owner",
        "not_member",
      ].includes(String(error.code)))
  );
}

export function isPermanentBridgeFailure(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error))
    return false;
  return [400, 404, 409, 410, 422].includes(Number(error.status));
}

export function cancelledBridgeOperation(explicit: boolean): void {
  if (explicit)
    throw new DOMException("Bridge connection cancelled", "AbortError");
}
export function isBridgeAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function isBridgeAbsent(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("status" in error) ||
    error.status !== 404
  )
    return false;
  if ("code" in error && error.code !== undefined)
    return error.code === "bridge_not_found";
  // HoustonEngineError keeps gateway's top-level code in body; its getter
  // exposes only the nested host error shape.
  const body = "body" in error ? error.body : undefined;
  return (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    body.code === "bridge_not_found"
  );
}
