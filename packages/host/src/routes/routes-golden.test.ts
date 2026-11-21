import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { replayRoutes } from "../testing/route-replay";

const BASELINE = new URL("./routes.golden.json", import.meta.url);

test("routing answers match the recorded baseline", async () => {
  const replayed = await replayRoutes();
  const serialized = `${JSON.stringify(replayed, null, 2)}\n`;
  if (process.env.HOUSTON_ROUTES_GOLDEN === "update") {
    writeFileSync(BASELINE, serialized);
    return;
  }
  const recorded = readFileSync(BASELINE, "utf8");
  expect(replayed).toEqual(JSON.parse(recorded));
  expect(serialized).toBe(recorded);
}, 600_000);
