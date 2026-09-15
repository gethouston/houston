import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/**
 * Playwright loads the config, every spec and every support module with its
 * own ESM loader, which refuses a JSON import that carries no `type: json`
 * attribute; `@houston/domain`'s barrel reaches such imports, so the fake host
 * and the harness may only import domain LEAF subpaths. Listing the suite is
 * the cheapest run of that loader over the whole graph, so a bad import fails
 * here in a second instead of at the top of a six-minute run.
 */
test("Playwright can load the whole e2e harness", () => {
  const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const run = spawnSync(
    "pnpm",
    ["exec", "playwright", "test", "--list", "--reporter=list"],
    { cwd: web, encoding: "utf8", timeout: 60_000 },
  );
  expect(run.stderr).not.toMatch(/needs an import attribute|Error:/);
  expect(run.status).toBe(0);
  expect(run.stdout).toMatch(/Total: \d+ tests? in \d+ files?/);
});
