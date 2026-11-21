import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

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
