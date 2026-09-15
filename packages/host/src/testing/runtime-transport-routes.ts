import { readdirSync, readFileSync } from "node:fs";

/**
 * WHAT THE PI RUNTIME'S TRANSPORT ACTUALLY SERVES, read back out of its own
 * source. The host forwards `/agents/:agentId/<rest>` to it (routes/agents.ts)
 * and publishes the pairs as the proxy family's members
 * (routes/agents-proxy-members.ts) — two lists in two packages that nothing
 * links, so this reads the implementation and the member list is compared
 * against it (routes/agents-proxy-members.test.ts).
 *
 * The transport files share one grammar, which is the whole reason a source
 * pass is possible instead of booting the runtime:
 *
 *  - `method === "M" && path === "/p"` — a literal pair.
 *  - `method !== "M" || path !== "/p"` — the same pair as an early return.
 *  - `const m = path.match(/re/)` then `method === "M" && m`, or
 *    `m && (method === "M1" || method === "M2")` — a pattern pair.
 *  - `method === "M" && action === "A"` — a pair whose path is the alternation
 *    regex above it with `A` substituted in.
 *
 * Anything written another way is invisible here, which is why the comparison
 * is an equality against a hand-written list rather than a subset check: a
 * transport route added in a shape this does not know makes the test fail.
 */
/** `METHOD path`, with every capture spelled `:param` so only shape matters. */
export type RoutePair = string;

const normalise = (path: string): string =>
  path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ":param" : segment))
    .join("/");

/** The pair as this module and the member list both spell it: no leading `/`. */
const pair = (method: string, path: string): RoutePair =>
  `${method} ${normalise(path).replace(/^\//, "")}`;

/** Every literal path a regex source stands for, alternations expanded. */
function templates(source: string): string[] {
  const body = source
    .replace(/^\^/, "")
    .replace(/\$$/, "")
    .replace(/\\\//g, "/");
  const alternation = body.match(/\(([^()]*\|[^()]*)\)/);
  const single = body.replace(/\([^)]*\)/g, ":param");
  if (!alternation?.[1]) return [single];
  return alternation[1]
    .split("|")
    .map((option) =>
      body.replace(alternation[0], option).replace(/\([^)]*\)/g, ":param"),
    );
}

/** `const <name> = path.match(/<source>/)`, across line breaks. */
function matchConstants(file: string): Map<string, string> {
  const constants = new Map<string, string>();
  const pattern = /const (\w+) = (?:ctx\.)?path\.match\(\s*\/(.+?)\/,?\s*\)/gs;
  for (const found of file.matchAll(pattern))
    if (found[1] && found[2]) constants.set(found[1], found[2]);
  return constants;
}

function pairsIn(file: string): RoutePair[] {
  const pairs: RoutePair[] = [];
  const constants = matchConstants(file);
  const M = `(?:ctx\\.)?method`;
  const P = `(?:ctx\\.)?path`;
  for (const [, method, path] of file.matchAll(
    new RegExp(`${M} === "(\\w+)" && ${P} === "([^"]+)"`, "g"),
  ))
    if (method && path) pairs.push(pair(method, path));
  for (const [, method, path] of file.matchAll(
    new RegExp(`${M} !== "(\\w+)" \\|\\| ${P} !== "([^"]+)"`, "g"),
  ))
    if (method && path) pairs.push(pair(method, path));
  for (const [name, source] of constants) {
    const paths = templates(source);
    const methods = [
      ...file.matchAll(new RegExp(`${M} === "(\\w+)" && ${name}\\b`, "g")),
      ...file.matchAll(
        new RegExp(
          `${name} && \\(${M} === "(\\w+)" \\|\\| ${M} === "(\\w+)"`,
          "g",
        ),
      ),
    ].flatMap((found) =>
      found.slice(1).filter((value): value is string => !!value),
    );
    for (const method of methods)
      for (const path of paths) pairs.push(pair(method, path));
  }
  // The action form: the path is whichever alternation above names that action.
  for (const [, method, action] of file.matchAll(
    new RegExp(`${M} === "(\\w+)" && action === "([\\w-]+)"`, "g"),
  )) {
    if (!method || !action) continue;
    for (const source of constants.values()) {
      const path = templates(source).find((option) =>
        option.endsWith(`/${action}`),
      );
      if (path) pairs.push(pair(method, path));
    }
  }
  return pairs;
}

/**
 * Every source file of the transport, read off the directory so a file added
 * there cannot be invisible to the scan. The directory is flat, so entries that
 * are not `.ts` files are skipped rather than descended into; `*.test.ts` is
 * excluded because a test asserting a 404 would otherwise read as a route.
 */
export function runtimeTransportFiles(transportDir: URL): string[] {
  return readdirSync(transportDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts"),
    )
    .map((entry) => entry.name)
    .sort();
}

/** Every `METHOD rest` pair packages/runtime's transport server answers. */
export function runtimeTransportRoutes(transportDir: URL): Set<RoutePair> {
  const pairs = new Set<RoutePair>();
  for (const name of runtimeTransportFiles(transportDir))
    for (const found of pairsIn(
      readFileSync(new URL(name, transportDir), "utf8"),
    ))
      pairs.add(found);
  return pairs;
}
