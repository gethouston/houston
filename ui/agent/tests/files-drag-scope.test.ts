import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  internalDragPayload,
  parseInternalDragPayload,
  resolveInternalMoveTarget,
} from "../src/internal-file-drag.ts";

describe("internal file drag scope", () => {
  it("round-trips the filesystem owner with the path", () => {
    assert.deepEqual(
      parseInternalDragPayload(internalDragPayload("Docs/a.md", "agent-a")),
      {
        path: "Docs/a.md",
        scope: "agent-a",
      },
    );
  });

  it("rejects payloads that cannot prove their path", () => {
    assert.throws(() => parseInternalDragPayload('{"scope":"agent-b"}'));
    assert.throws(() => parseInternalDragPayload("not-json"));
  });

  it("moves an internal file into the folder hovered at drop time", () => {
    assert.equal(
      resolveInternalMoveTarget(() => "Docs"),
      "Docs",
    );
    assert.equal(resolveInternalMoveTarget(undefined), null);
  });
});
