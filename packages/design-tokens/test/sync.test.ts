import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Guards that the committed dist/ is exactly what the current tokens + build
 * produce. Rebuilds to a temp dir and diffs every output file. Runs inside the
 * workspace `pnpm test` with no CI wiring.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const outputs = [
  "css/tokens.css",
  "ts/tokens.ts",
  "swift/HoustonTokens.swift",
  "kotlin/HoustonTokens.kt",
];

const fresh = mkdtempSync(join(tmpdir(), "houston-tokens-sync-"));

execFileSync("node", ["build/index.mjs"], {
  cwd: root,
  env: { ...process.env, OUT_DIR: fresh },
  stdio: "pipe",
});

afterAll(() => rmSync(fresh, { recursive: true, force: true }));

describe("committed dist is in sync with source", () => {
  for (const rel of outputs) {
    it(`${rel} matches a fresh build`, () => {
      const committed = readFileSync(join(root, "dist", rel), "utf8");
      const rebuilt = readFileSync(join(fresh, rel), "utf8");
      expect(
        committed,
        `dist/${rel} is stale — run: pnpm --filter @houston/design-tokens build`,
      ).toBe(rebuilt);
    });
  }
});
