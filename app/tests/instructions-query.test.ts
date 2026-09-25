import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * The instructions query's failure path. The hook loads the engine barrel,
 * which this suite's runner cannot import, so the seam is pinned on source.
 * A missing CLAUDE.md already reads as `""` from the host; any other failure
 * must stay a query error (the engine-call layer has reported it), never an
 * empty job description.
 */
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
