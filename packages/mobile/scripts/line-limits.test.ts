import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("turn executor and host dependencies fit the module line limit", () => {
  for (const file of [
    "packages/runtime/src/turn/execute-turn.ts",
    "packages/host/src/control-plane-deps.ts",
  ]) {
    const text = readFileSync(`../../${file}`, "utf8");
    expect(text.trimEnd().split("\n").length, file).toBeLessThanOrEqual(200);
  }
});
