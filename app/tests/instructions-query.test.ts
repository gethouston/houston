import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function source(path: string): string {
  return readFileSync(join(import.meta.dirname, "../src", path), "utf8");
}

describe("the instructions query stays honest", () => {
  it("never turns a failed read into an empty job description", () => {
    const hook = source("hooks/queries/use-instructions.ts");
    assert.doesNotMatch(hook, /\.catch\(/);
  });

  it("the Job description tab renders a failed read, not an endless spinner", () => {
    const tab = source(
      "components/agent/agent-admin/agent-admin-instructions.tsx",
    );
    assert.match(tab, /isError/);
    assert.match(tab, /instructions\.loadFailed/);
  });
});
