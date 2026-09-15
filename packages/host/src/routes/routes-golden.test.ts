import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { replayRoutes } from "../testing/route-replay";

/**
 * THE routing baseline: what every probed pair answers, for every route the
 * host serves.
 *
 * Every probe in testing/route-probes.ts is replayed against a real host and
 * its answer recorded — status, content type, error vocabulary, body shape and
 * which request (if any) reached the runtime proxy. That last field is what
 * makes "which handler won" observable without instrumenting the chain, and it
 * is why this is stronger than asserting on a chosen handler: it also pins the
 * answer a handler gives when its dependency is unwired.
 *
 * routes.golden.json IS that answer set, committed. A diff in it is a diff in
 * what some caller receives, so re-record with `HOUSTON_ROUTES_GOLDEN=update`
 * only for a difference the PR body justifies — never to make a red test go
 * green.
 */
const BASELINE = new URL("./routes.golden.json", import.meta.url);

test("routing answers match the recorded baseline", async () => {
  const replayed = await replayRoutes();
  const serialized = `${JSON.stringify(replayed, null, 2)}\n`;
  if (process.env.HOUSTON_ROUTES_GOLDEN === "update") {
    writeFileSync(BASELINE, serialized);
    return;
  }
  const recorded = readFileSync(BASELINE, "utf8");
  // Compared as data first (a readable per-probe diff), then as text — the
  // baseline is committed, so key order is part of what must not move.
  expect(replayed).toEqual(JSON.parse(recorded));
  expect(serialized).toBe(recorded);
}, 600_000);
