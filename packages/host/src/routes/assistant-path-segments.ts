import type { AssistantRoute } from "../assistant/catalog";

/**
 * THE ADDRESS SEGMENTS one catalogued operation acts on.
 *
 * These values come from a language model and are pasted into a URL the host
 * then performs with the GATEWAY credential, so a value that quietly resolves
 * onto another operation's address is the whole attack. Split out of
 * assistant-request-parts.ts so the rule reads on its own.
 */

/**
 * The value a URL parser will END UP with, however many times it is decoded on
 * the way. `encodeURIComponent("..")` is still `".."`, and a value spelled
 * `"..%2F.."` survives this boundary as `"..%252F.."` only to be decoded back
 * to `"../.."` by a route that captures a segment and decodes it (routes/
 * skills.ts). So the check runs on the fully-decoded value, not the raw one.
 *
 * Decoding STOPS at a value that is not valid percent-encoding (a literal `%`
 * in a real name, "50% off") rather than refusing it: nothing downstream can
 * decode it further either, so what is here is what it will address.
 */
function fullyDecoded(segment: string): string {
  let decoded = segment;
  for (;;) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return decoded;
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
}

/**
 * One segment of the address this call will act on. Refused: empty, `.`, `..`
 * (a URL parser resolves these away and lands the call on ANOTHER operation's
 * address, which the host then performs with the gateway credential), a
 * separator that would add a segment, and control characters (a NUL truncates
 * the path in some downstream readers).
 */
export function safeSegment(segment: string): boolean {
  const decoded = fullyDecoded(segment);
  return (
    decoded !== "" &&
    decoded !== "." &&
    decoded !== ".." &&
    !/[\\/]/.test(decoded) &&
    // Control characters, NUL first among them: they truncate or re-frame a
    // path in whatever reads it downstream, and no real name carries one.
    ![...decoded].some((c) => {
      const code = c.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    })
  );
}

/**
 * WHICH parts of one path value have to stand on their own.
 *
 * A `path` parameter carries a relative path, so its `/` separators survive
 * into the address and each part is its own segment. A parameter in the
 * `/agents/{...}` position carries an agent reference, which the caller may
 * qualify as `Workspace/Agent` (`agentId`, `agentSlugOrId`, `agentPath`, `id`,
 * depending on the route): that `/` is ESCAPED into one segment, so the address
 * gains no depth, but each half still has to be a real name - `"..%2F.."`
 * reaches a local route that decodes its capture and would land on `"../.."`.
 * Every other value occupies exactly one segment as written.
 */
export function addressSegments(
  route: AssistantRoute,
  name: string,
  encoding: string,
  value: string,
): string[] {
  return encoding === "path" || route.path.includes(`/agents/{${name}}`)
    ? value.split("/")
    : [value];
}
