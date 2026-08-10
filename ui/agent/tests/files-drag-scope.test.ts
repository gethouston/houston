import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dragAllowsScope,
  internalDragPayload,
  internalDragTypes,
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

  it("allows external drags regardless of scope", () => {
    assert.equal(dragAllowsScope(["Files"], "agent-b"), true);
  });

  it("allows an internal drag with the matching scope", () => {
    assert.equal(
      dragAllowsScope(internalDragTypes("agent-a"), "agent-a"),
      true,
    );
  });

  it("refuses an internal drag from another scope", () => {
    assert.equal(
      dragAllowsScope(internalDragTypes("agent-a"), "agent-b"),
      false,
    );
  });

  it("round-trips a scope that needs URI encoding", () => {
    const scope = "agent/a; workspace";
    assert.equal(dragAllowsScope(internalDragTypes(scope), scope), true);
  });

  it("matches uppercase scope ids after browser type lowercasing", () => {
    const types = internalDragTypes("AgentA").map((type) => type.toLowerCase());
    assert.equal(dragAllowsScope(types, "AgentA"), true);
  });
});
