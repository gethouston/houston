export interface PatternMatch {
  params: Record<string, string>;
  rest: string;
}

const isParam = (segment: string): boolean =>
  segment.startsWith(":") && segment.length > 1;

const isRest = (segment: string): boolean =>
  segment.startsWith("*") && segment.length > 1;

export function patternParams(pattern: string): string[] {
  return pattern
    .split("/")
    .filter(isParam)
    .map((segment) => segment.slice(1));
}

// WHY: Nothing is normalized; folding the trailing slash would make /agents/ start proxying. ADR-0016
export function matchPath(pattern: string, path: string): PatternMatch | null {
  const patternSegments = pattern.split("/");
  const pathSegments = path.split("/");
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const expected = patternSegments[i];
    if (expected === undefined) return null;
    if (isRest(expected)) {
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
  if (pathSegments.length !== patternSegments.length) return null;
  return { params, rest: "" };
}

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
      if (isRest(s) || !s) return false;
      continue;
    }
    if (g !== s) return false;
  }
  return generalSegments.length === specificSegments.length;
}
