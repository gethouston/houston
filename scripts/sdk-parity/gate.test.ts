import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";
import { type Exceptions, judge, parseExceptions } from "./gate.ts";
import { type DesktopCalls, repoRoot } from "./inputs.ts";
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
    "packages/web/src/engine-adapter/client/example-mixin.ts",
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
