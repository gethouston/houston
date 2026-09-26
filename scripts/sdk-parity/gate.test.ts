import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";
import { buildGraph, nodeKey } from "./adapter-graph.ts";
import { classifyAdapter } from "./adapter-methods.ts";
import { type Exceptions, judge, parseExceptions } from "./gate.ts";
import type { GatewayRoute } from "./gateway-inventory.ts";
import {
  type DesktopCalls,
  repoRoot,
  type SdkMethod,
  sdkMethodOf,
} from "./inputs.ts";
import { checkRules, type Violation } from "./rules.ts";

const VIOLATION: Violation = {
  rule: "proxy-drift",
  key: "proxy GET /agents/{}/whatever",
  message: "runtime-proxy member GET /agents/{}/whatever is reached by nothing",
};

const excusing = (...keys: string[]): Exceptions => ({
  baseline: keys.length,
  entries: keys.map((key) => ({
    rule: "proxy-drift" as const,
    key,
    reason: "written down so a reader knows why parity stops here",
  })),
});

test("a violation no exception excuses fails the gate", () => {
  const verdict = judge([VIOLATION], excusing(), "summary");
  expect(verdict.failures).toHaveLength(1);
  expect(verdict.failures[0]).toContain(VIOLATION.key);
  expect(verdict.report).toContain(VIOLATION.message);
});

test("an excused violation passes and is left out of the report", () => {
  const verdict = judge([VIOLATION], excusing(VIOLATION.key), "summary");
  expect(verdict.failures).toEqual([]);
  expect(verdict.report).toContain("proxy-drift: 0");
});

test("an exception whose violation no longer reproduces fails as stale", () => {
  const verdict = judge([], excusing(VIOLATION.key), "summary");
  expect(verdict.failures).toHaveLength(1);
  expect(verdict.failures[0]).toContain("no longer reproduces");
  expect(verdict.report).toContain("1 stale");
});

test("more entries than the baseline is refused outright", () => {
  const file = { ...excusing(VIOLATION.key), baseline: 0 };
  expect(() => parseExceptions(file, "fixture")).toThrow(
    /exceed the 0 baseline/,
  );
});

test("an entry that excuses nothing readable is refused", () => {
  expect(() =>
    parseExceptions(
      {
        baseline: 3,
        entries: [
          { rule: "no-such-rule", key: "x", reason: "a reason long enough" },
          { rule: "proxy-drift", key: "y", reason: "too short" },
          { rule: "proxy-drift", key: "", reason: "a reason long enough" },
        ],
      },
      "fixture",
    ),
  ).toThrow(
    /is not one of[\s\S]*20\+ characters[\s\S]*must name the violation/,
  );
});

test("the same violation cannot be excused twice", () => {
  expect(() =>
    parseExceptions(excusing(VIOLATION.key, VIOLATION.key), "fixture"),
  ).toThrow(/a second time/);
});

/** One classified adapter method, as `desktopCalls()` reports it. */
const method = (name: string, bound: boolean) => ({
  name,
  source: resolve(
    repoRoot,
    "packages/engine-adapter/src/client/example-mixin.ts",
  ),
  bound,
  unbound: !bound,
});

const client = (...unbound: string[]): DesktopCalls => ({
  sdk: [],
  native: [],
  unbound: unbound.map((name) => method(name, false)),
});

const UNBOUND_EXCUSE = {
  rule: "client-route-unbound" as const,
  key: "client rawRead",
  reason: "written down so a reader knows why this one stays off the SDK",
};

test("an adapter method that reaches a server without the SDK is a violation", () => {
  const violations = checkRules([], [], [], client("rawRead"));
  expect(violations).toHaveLength(1);
  expect(violations[0]).toMatchObject({
    rule: "client-route-unbound",
    key: "client rawRead",
  });
  const verdict = judge(violations, { baseline: 0, entries: [] }, "summary");
  expect(verdict.failures).toHaveLength(1);
  expect(verdict.failures[0]).toContain("client rawRead");
});

test("an adapter method that delegates to the SDK is no violation", () => {
  const bound: DesktopCalls = {
    sdk: [method("rawRead", true)],
    native: [],
    unbound: [],
  };
  expect(checkRules([], [], [], bound)).toEqual([]);
});

test("an excuse for an adapter method that now delegates fails as stale", () => {
  const bound: DesktopCalls = { sdk: [], native: [], unbound: [] };
  const verdict = judge(
    checkRules([], [], [], bound),
    { baseline: 1, entries: [UNBOUND_EXCUSE] },
    "summary",
  );
  expect(verdict.failures).toHaveLength(1);
  expect(verdict.failures[0]).toContain("no longer reproduces");
});

/**
 * The edges one adapter function publishes, read off a throwaway module —
 * `buildGraph` parses files, so the fixture is written to disk. `helpers.ts`
 * has to exist for the import to resolve; only `mixin.ts` is parsed.
 */
function edgesOf(body: string): {
  edges: string[];
  helperKey: (name: string) => string;
} {
  const directory = mkdtempSync(join(tmpdir(), "adapter-graph-"));
  writeFileSync(
    join(directory, "helpers.ts"),
    "export const helper = { run: () => {} };\n" +
      "export const ready = Promise.resolve({ refresh: () => {} });\n",
  );
  const mixin = join(directory, "mixin.ts");
  writeFileSync(
    mixin,
    `import { helper, ready } from "./helpers.ts";\n${body}`,
  );
  const graph = buildGraph([mixin]);
  return {
    edges: graph.nodes.get(nodeKey(mixin, "call"))?.edges ?? [],
    helperKey: (name) => nodeKey(join(directory, "helpers.ts"), name),
  };
}

test("a method reaching a space-pinned SDK is bound", () => {
  const directory = mkdtempSync(join(tmpdir(), "adapter-methods-"));
  const mixin = join(directory, "layout-mixin.ts");
  writeFileSync(
    mixin,
    "export class Layout {\n" +
      "  ctx = { sdkForSpace: (_slug: string | null) => ({}) };\n" +
      "  read(): unknown {\n" +
      "    return this.ctx.sdkForSpace(null);\n" +
      "  }\n" +
      "}\n",
  );
  expect(classifyAdapter([mixin])).toMatchObject([
    { name: "read", bound: true, unbound: false },
  ]);
});

test("a callee behind a cast is still an edge", () => {
  const { edges, helperKey } = edgesOf(
    "export function call(): void {\n  (helper.run as () => void)();\n}\n",
  );
  expect(edges).toContain(helperKey("run"));
});

test("a callee reached through await is still an edge", () => {
  const { edges, helperKey } = edgesOf(
    "export async function call(): Promise<void> {\n" +
      "  (await ready).refresh();\n}\n",
  );
  expect(edges).toContain(helperKey("refresh"));
});

/**
 * The join across a path parameter a server spells out member by member.
 *
 * `schema` is the provider parameter's: closed to two spellings as the
 * extractor writes a string-literal union, or open when it is a plain string.
 */
const connections = (schema: Record<string, unknown>): SdkMethod =>
  sdkMethodOf(
    "integrationConnections",
    {
      method: "GET",
      path: "/v1/integrations/{provider}/connections",
      pathParams: [{ name: "provider", encoding: "segment" }],
      query: {},
      body: null,
      bodyFields: null,
    },
    [{ name: "provider", required: true, schema }],
  );

const CLOSED = {
  anyOf: [
    { const: "composio", type: "string" },
    { const: "custom", type: "string" },
  ],
};

const served = (pattern: string): GatewayRoute[] => [
  { pattern, methods: ["GET"], classification: "sdk" },
];

const NO_CLIENT: DesktopCalls = { sdk: [], native: [], unbound: [] };

test("a closed path parameter binds the literal route naming a member", () => {
  const sdk = connections(CLOSED);
  expect(sdk.keys).toEqual([
    "GET /v1/integrations/{}/connections",
    "GET /v1/integrations/composio/connections",
    "GET /v1/integrations/custom/connections",
  ]);
  expect(
    checkRules(
      [],
      served("/v1/integrations/composio/connections"),
      [sdk],
      NO_CLIENT,
    ),
  ).toEqual([]);
});

test("a literal route no member names is still unbound", () => {
  const violations = checkRules(
    [],
    served("/v1/integrations/stripe/connections"),
    [connections(CLOSED)],
    NO_CLIENT,
  );
  expect(
    violations.filter((v) => v.rule === "sdk-route-unbound"),
  ).toMatchObject([{ key: "gateway GET /v1/integrations/stripe/connections" }]);
});

test("an open path parameter binds no literal route", () => {
  const violations = checkRules(
    [],
    served("/v1/integrations/composio/connections"),
    [connections({ type: "string" })],
    NO_CLIENT,
  );
  expect(
    violations.filter((v) => v.rule === "sdk-route-unbound"),
  ).toMatchObject([
    { key: "gateway GET /v1/integrations/composio/connections" },
  ]);
});

/**
 * Expanding a closed parameter must not invent work for the client: the method
 * issues one call per call site, so a server answering ONE member answers it.
 */
test("one member served is enough to serve the method", () => {
  const violations = checkRules(
    [],
    served("/v1/integrations/composio/connections"),
    [connections(CLOSED)],
    NO_CLIENT,
  );
  expect(violations.filter((v) => v.rule === "sdk-method-unserved")).toEqual(
    [],
  );
});

test("a method no member reaches is still unserved", () => {
  const violations = checkRules(
    [],
    served("/v1/integrations/stripe/connections"),
    [connections(CLOSED)],
    NO_CLIENT,
  );
  expect(
    violations.filter((v) => v.rule === "sdk-method-unserved"),
  ).toMatchObject([{ key: "sdk GET /v1/integrations/{}/connections" }]);
});

const EXCEPTIONS = resolve(repoRoot, "scripts/sdk-parity-exceptions.json");

test("the committed exceptions file is well formed", () => {
  const file = parseExceptions(
    JSON.parse(readFileSync(EXCEPTIONS, "utf8")),
    EXCEPTIONS,
  );
  expect(file.entries.length).toBe(file.baseline);
});

/**
 * The gate is only a gate if the PROCESS fails, so this runs the real script
 * against the real tree with one entry removed from the exceptions file.
 * Slow (it reads both route sources and the whole SDK) and worth it: every
 * other test here judges a fixture the script itself might never reach.
 */
test("the checker exits non-zero when a violation is not excused", () => {
  const file = parseExceptions(
    JSON.parse(readFileSync(EXCEPTIONS, "utf8")),
    EXCEPTIONS,
  );
  const dropped = file.entries[0];
  if (!dropped) throw new Error("the exceptions file excuses nothing to drop");
  const fixture = join(mkdtempSync(join(tmpdir(), "sdk-parity-")), "e.json");
  writeFileSync(
    fixture,
    JSON.stringify({ baseline: file.baseline, entries: file.entries.slice(1) }),
  );
  const run = (): string => {
    try {
      execFileSync("pnpm", ["exec", "tsx", "scripts/check-sdk-parity.ts"], {
        cwd: repoRoot,
        env: { ...process.env, HOUSTON_SDK_PARITY_EXCEPTIONS: fixture },
        encoding: "utf8",
        stdio: "pipe",
      });
      return "";
    } catch (err) {
      const failed = err as { status?: number; stderr?: string };
      expect(failed.status).toBe(1);
      return failed.stderr ?? "";
    }
  };
  expect(run()).toContain(dropped.key);
}, 120_000);

/**
 * Neither server is ever optional: the gateway's inventory is vendored into
 * this repo, so a method no server serves is a violation on every run — there
 * is no configuration in which it goes unjudged.
 */
test("a method neither server serves is a violation", () => {
  const hostless = [
    { name: "orgGet", key: "GET /v1/org", keys: ["GET /v1/org"] },
  ];
  const judged = checkRules([], [], hostless, client());
  expect(judged.map((v) => v.rule)).toEqual(["sdk-method-unserved"]);
});
