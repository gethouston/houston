export function isBridgeUnsupported(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code !== undefined)
    return error.code === "bridge_not_supported";
  const body = "body" in error ? error.body : undefined;
  return (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    body.code === "bridge_not_supported"
  );
}
