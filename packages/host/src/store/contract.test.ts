import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runWorkspaceStoreContract } from "../testing/store-contract";
import { LocalWorkspaceStore } from "./local";
import { MemoryWorkspaceStore } from "./memory";

runWorkspaceStoreContract(
  "MemoryWorkspaceStore",
  () => new MemoryWorkspaceStore(),
);
runWorkspaceStoreContract(
  "LocalWorkspaceStore",
  () =>
    new LocalWorkspaceStore(
      mkdtempSync(join(tmpdir(), "houston-store-contract-")),
    ),
);

describe("WorkspaceStore divergences (asserted per-impl, NOT in the shared contract)", () => {
  test("Memory flips the workspace runtime; Local refuses (always 'local')", async () => {
    const mem = new MemoryWorkspaceStore();
    const ws = await mem.getOrCreatePersonalWorkspace("user-1");
    const flipped = await mem.setWorkspaceRuntime(ws.id, "cloudrun");
    expect(flipped.runtime).toBe("cloudrun");

    const local = new LocalWorkspaceStore(
      mkdtempSync(join(tmpdir(), "houston-store-div-")),
    );
    const lws = await local.getOrCreatePersonalWorkspace("local-owner");
    expect(lws.runtime).toBe("local");
    await expect(local.setWorkspaceRuntime(lws.id, "cloudrun")).rejects.toThrow(
      /always run 'local'/,
    );
  });

  test("Memory keys the personal workspace by userId; Local has a single user", async () => {
    const mem = new MemoryWorkspaceStore();
    const a = await mem.getOrCreatePersonalWorkspace("user-1");
    const b = await mem.getOrCreatePersonalWorkspace("user-2");
    expect(a.id).not.toBe(b.id);

    const local = new LocalWorkspaceStore(
      mkdtempSync(join(tmpdir(), "houston-store-user-")),
    );
    const l1 = await local.getOrCreatePersonalWorkspace("user-1");
    const l2 = await local.getOrCreatePersonalWorkspace("user-2");
    expect(l1.id).toBe(l2.id);
  });
});
