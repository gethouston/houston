import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { spillToolResult } from "./spill";

let workspaceDir: string;
beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "spill-"));
});
afterEach(() => rmSync(workspaceDir, { recursive: true, force: true }));

const MiB = 1024 * 1024;

test("the same result saves once, to the same path, with nothing half-written left", () => {
  const target = { workspaceDir, conversationId: "conv/1" };
  const first = spillToolResult(target, "run_code", "hello");
  expect(spillToolResult(target, "run_code", "hello")).toBe(first);
  expect(first).toMatch(/^\.tool-results\/conv_1\/run_code-[0-9a-f]{16}\.txt$/);
  expect(readFileSync(join(workspaceDir, first), "utf8")).toBe("hello");
  expect(readdirSync(join(workspaceDir, ".tool-results", "conv_1"))).toEqual([
    first.split("/").at(-1),
  ]);
});

test("the folder stays within 16 MiB by dropping the oldest results, never the one just saved", () => {
  const saved: string[] = [];
  for (let i = 0; i < 16; i++) {
    const path = spillToolResult(
      { workspaceDir, conversationId: `c${i % 3}` },
      "integration_execute",
      `${i}`.padEnd(MiB, "x"),
    );
    // Oldest first, a second apart, whatever the filesystem's mtime grain.
    utimesSync(join(workspaceDir, path), 1_000 + i, 1_000 + i);
    saved.push(path);
  }
  expect(saved.every((p) => existsSync(join(workspaceDir, p)))).toBe(true);

  const big = spillToolResult(
    { workspaceDir, conversationId: "c9" },
    "run_code",
    "y".repeat(2 * MiB),
  );
  expect(existsSync(join(workspaceDir, big))).toBe(true);
  expect(saved.filter((p) => !existsSync(join(workspaceDir, p)))).toEqual(
    saved.slice(0, 2),
  );
});
