/**
 * WHAT THIS DEPLOYMENT CANNOT DO, expressed as the one variable a spawned
 * coordinator reads and the one refusal a caller gets.
 *
 * The operation catalog describes a single surface that the local host and the
 * hosted gateway both serve, and a large slice of it — spaces, teams, billing,
 * the hosted identity profile — exists only on the gateway. On a desktop the
 * AI Manager still carries every one of those names in its capability map, so
 * it offers the user a thing its own host cannot address, and the failure
 * arrives as an opaque gateway error rather than as "that is not something
 * this Houston can do".
 *
 * The HOST decides, because the host is the process that knows which routes it
 * serves (`packages/host/src/assistant/served-operations.ts` derives the answer
 * from its route registry). It stamps the answer at spawn, exactly as it
 * stamps the coordinator role, and the runtime reads it back at boot. The
 * names live in DOMAIN because both sides of that handshake need them and
 * neither owns the other.
 *
 * FAIL OPEN, deliberately: an absent or empty variable filters nothing. A
 * gateway-fronted pod serves the whole surface and stamps nothing, and a host
 * that somehow could not work the answer out must leave the assistant with
 * more than it can perform rather than with less — the first case is one
 * honest refusal, the second is a capability silently missing from the product.
 */

/** The one variable a spawned coordinator reads to learn what it may not call. */
export const ASSISTANT_UNSERVED_ENV = "HOUSTON_ASSISTANT_UNSERVED";

/** The one refusal a caller gets for an operation this deployment does not serve. */
export const ASSISTANT_UNAVAILABLE_HERE = "operation_unavailable_here";

/**
 * The environment carrying `names`, or nothing when there are none.
 *
 * Comma-joined with no spaces, and no escaping: catalog names are
 * `[A-Za-z0-9.]+` throughout, which the parity test asserts rather than
 * assumes — an escaping scheme nobody can see a reason for is a scheme that
 * gets the reason wrong.
 */
export function assistantUnservedEnv(
  names: readonly string[],
): Record<string, string> {
  return names.length > 0 ? { [ASSISTANT_UNSERVED_ENV]: names.join(",") } : {};
}

/** What the host TOLD this process it cannot perform. Absent or empty = nothing. */
export function readUnservedOperations(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> {
  const raw = env[ASSISTANT_UNSERVED_ENV]?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== ""),
  );
}
