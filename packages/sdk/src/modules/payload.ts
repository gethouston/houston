/**
 * Reading an untrusted command payload.
 *
 * A command envelope arrives as untrusted plain JSON, so every module that
 * registers a command has to narrow the same shapes off it. They do it through
 * here so a refusal reads the same wherever it comes from: one message shape,
 * which is what a caller matches on.
 *
 * These THROW rather than returning a default — `CommandRegistry.dispatch`
 * turns the throw into `ok: false` with the message, and a coerced default
 * would silently act on a field the caller never sent.
 */

/** The value at `key`, or `undefined` if `payload` is not an object. */
export function field(payload: unknown, key: string): unknown {
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)[key]
    : undefined;
}

/** A required non-empty string off an untrusted command payload. */
export function requireString(payload: unknown, key: string): string {
  const value = field(payload, key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing '${key}'`);
  }
  return value;
}

/** A required list of non-empty strings (a batch of ids) off that payload. */
export function requireStrings(payload: unknown, key: string): string[] {
  const value = field(payload, key);
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new Error(`'${key}' must be an array of ids`);
  }
  return value as string[];
}
