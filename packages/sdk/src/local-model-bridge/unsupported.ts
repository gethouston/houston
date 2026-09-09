/**
 * The deployment answered `/v1/capabilities` without bridge v1 (the engine
 * adapter's `bridge_not_supported` 503). A server's shape does not change on a
 * retry curve, so discovery must stop instead of polling it every 30s.
 * HoustonEngineError keeps the adapter's top-level code on `body`, not `code`.
 *
 * Kept in its own erasable-syntax-only module: the app's node:test entry
 * points load it through the `@houston/sdk/local-model-bridge/unsupported`
 * subpath, and node's type stripping rejects the parameter properties in
 * `errors.ts`.
 */
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
