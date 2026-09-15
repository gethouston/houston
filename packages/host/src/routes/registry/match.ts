/**
 * The matcher. Deliberately dumb: segment-wise comparison, registration order
 * is match order, and NOTHING is normalised. Every departure from that moves
 * which handler wins for some path — `/agents/` matches nothing, because
 * routes/agents.ts's dispatch needs a non-empty rest, and a matcher that
 * folded the trailing slash away would start proxying it.
 *
 * The undecodable-`:name` rule below is the one that reaches EVERY declared
 * route: a percent escape `decodeURIComponent` throws on makes the pattern
 * miss, so such a path falls through to whatever claims it next — the chain's
 * 404 for a user-level path, the agent's own engine for an agent-scoped one
 * (`/agents/{id}/skills/%E0%A4%A` is forwarded). Authorization is unaffected:
 * an undecodable agent id misses every agent-phase pattern, so nothing that
 * needs an owner ever runs without one.
 */

export interface PatternMatch {
  /** Decoded `:name` captures. */
  params: Record<string, string>;
  /** The `*rest` capture, raw and undecoded; "" when the pattern has none. */
  rest: string;
}

/** A pattern segment that captures one segment under `:name`. */
const isParam = (segment: string): boolean =>
  segment.startsWith(":") && segment.length > 1;

/** A pattern segment that captures the remainder under `*rest`. */
const isRest = (segment: string): boolean =>
  segment.startsWith("*") && segment.length > 1;

/** The `:name` parameters a pattern declares, in order. */
export function patternParams(pattern: string): string[] {
  return pattern
    .split("/")
    .filter(isParam)
    .map((segment) => segment.slice(1));
}

/**
 * Match `path` against `pattern`, or null when it does not match.
 *
 * A `:name` capture must be a non-empty segment and is decoded; a URIError
 * makes the route NOT match, so the request falls through exactly as
 * routes/custom-integrations.ts does when `decodeURIComponent` throws. A
 * `*rest` capture must be a non-empty remainder, mirroring `(.+)`.
 */
export function matchPath(pattern: string, path: string): PatternMatch | null {
  const patternSegments = pattern.split("/");
  const pathSegments = path.split("/");
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const expected = patternSegments[i];
    if (expected === undefined) return null;
    if (isRest(expected)) {
      // The remainder, joined back with the separators it was split on. Raw:
      // the runtime channel forwards these bytes as it received them.
      const rest = pathSegments.slice(i).join("/");
      if (!rest) return null;
      return { params, rest };
    }
    const actual = pathSegments[i];
    if (actual === undefined) return null;
    if (isParam(expected)) {
      if (!actual) return null;
      let decoded: string;
      try {
        decoded = decodeURIComponent(actual);
      } catch {
        return null;
      }
      if (!decoded) return null;
      params[expected.slice(1)] = decoded;
      continue;
    }
    if (expected !== actual) return null;
  }
  // No `*rest` consumed the tail, so the path must end exactly here. A
  // trailing slash leaves one extra (empty) segment and is therefore a
  // non-match: a family that wants it says so with an `owns` entry.
  if (pathSegments.length !== patternSegments.length) return null;
  return { params, rest: "" };
}

/**
 * Whether `general` matches every path `specific` matches — the shadowing test
 * routes/registry/order.test.ts uses to prove no later route swallows an
 * earlier one. Compared structurally (a `:name` or `*rest` covers any literal),
 * never by sampling paths.
 */
export function generalises(general: string, specific: string): boolean {
  const generalSegments = general.split("/");
  const specificSegments = specific.split("/");
  for (let i = 0; i < generalSegments.length; i++) {
    const g = generalSegments[i];
    if (g === undefined) return false;
    if (isRest(g)) return specificSegments.length > i;
    const s = specificSegments[i];
    if (s === undefined) return false;
    if (isParam(g)) {
      // A parameter covers any single non-empty segment, literal or captured,
      // but never the multi-segment tail a `*rest` can stand for.
      if (isRest(s) || !s) return false;
      continue;
    }
    if (g !== s) return false;
  }
  return generalSegments.length === specificSegments.length;
}
