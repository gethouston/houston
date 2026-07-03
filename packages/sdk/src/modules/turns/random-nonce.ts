/**
 * A random turn nonce, with a capability fallback chain.
 *
 * The wire nonce names our turn (the engine echoes it on the `user` frame). The
 * SDK's ports doc bans reaching for ambient globals directly, and `crypto` is a
 * hazard raw: some embedded JS runtimes ship neither `randomUUID` nor
 * `getRandomValues`, and `crypto.randomUUID` even THROWS in a browser insecure
 * context — either way a bare `crypto.randomUUID()` would break every send.
 * Degrade through the chain instead (each rung guarded against a missing OR
 * throwing primitive): a UUID when it works, then random-hex from
 * `getRandomValues`, then a `Math.random` hex last resort. Uniqueness (not
 * cryptographic strength) is all a per-turn correlation id needs.
 */
export function randomNonce(): string {
  const c: Partial<Crypto> | undefined =
    typeof crypto !== "undefined" ? crypto : undefined;
  try {
    if (typeof c?.randomUUID === "function") return c.randomUUID();
  } catch {
    /* insecure context / stubbed-out — fall through */
  }
  try {
    if (typeof c?.getRandomValues === "function") {
      const bytes = c.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    /* no usable CSPRNG — fall through to the last resort */
  }
  return (
    Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)
  );
}
