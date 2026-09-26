import { getPreference } from "@houston/domain";
import { describe, expect, test } from "vitest";
import { CloudPaths } from "../paths";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import {
  GATEWAY_NOTES_SWEPT_KEY,
  isEnginePod,
  sweepGatewayGroupNotes,
} from "./gateway-group-notes";

async function world(vfs: MemoryVfs = new MemoryVfs()) {
  const store = new MemoryWorkspaceStore();
  const paths = new CloudPaths();
  const ws = await store.getOrCreatePersonalWorkspace("owner");
  const ada = await store.createAgent({ workspaceId: ws.id, name: "Ada" });
  const bo = await store.createAgent({ workspaceId: ws.id, name: "Bo" });
  const note = (agent: typeof ada) => `${paths.agentRoot(ws, agent)}/GROUP.md`;
  const errors: unknown[] = [];
  const sweep = (enginePod: boolean) =>
    sweepGatewayGroupNotes({
      enginePod,
      store,
      vfs,
      paths,
      log: (_message, error) => errors.push(error),
    });
  return { store, vfs, ws, ada, bo, note, errors, sweep };
}

describe("isEnginePod", () => {
  const storeSync = { store: {} };

  test("is the gateway-fronted host that hydrates from the managed store", () => {
    expect(isEnginePod({ gatewayFronted: true, storeSync })).toBe(true);
  });

  test("is never desktop, self-host or a passive migration source", () => {
    expect(isEnginePod({})).toBe(false);
    expect(isEnginePod({ gatewayFronted: true })).toBe(false);
    expect(isEnginePod({ storeSync })).toBe(false);
    expect(
      isEnginePod({ gatewayFronted: true, storeSync, passive: true }),
    ).toBe(false);
  });
});

describe("sweepGatewayGroupNotes", () => {
  test("an engine pod deletes every agent's GROUP.md once", async () => {
    const { vfs, ws, ada, bo, note, errors, sweep } = await world();
    await vfs.writeText(note(ada), "Gateway context");
    await vfs.writeText(note(bo), "Gateway context");
    await sweep(true);
    expect(await vfs.readText(note(ada))).toBeNull();
    expect(await vfs.readText(note(bo))).toBeNull();
    expect(await getPreference(vfs, ws.id, GATEWAY_NOTES_SWEPT_KEY)).toBe("1");
    // A note written after the sweep belongs to whoever wrote it.
    await vfs.writeText(note(ada), "my own note");
    await sweep(true);
    expect(await vfs.readText(note(ada))).toBe("my own note");
    expect(errors).toEqual([]);
  });

  test("desktop and self-host keep a person's own GROUP.md", async () => {
    const { vfs, ws, ada, note, sweep } = await world();
    await vfs.writeText(note(ada), "my own note");
    await sweep(false);
    expect(await vfs.readText(note(ada))).toBe("my own note");
    expect(await getPreference(vfs, ws.id, GATEWAY_NOTES_SWEPT_KEY)).toBeNull();
  });

  test("an agent without a GROUP.md is fine", async () => {
    const { vfs, ws, errors, sweep } = await world();
    await sweep(true);
    expect(errors).toEqual([]);
    expect(await getPreference(vfs, ws.id, GATEWAY_NOTES_SWEPT_KEY)).toBe("1");
  });

  test("a failed removal is logged, spares the others, and retries next boot", async () => {
    let failing = true;
    let failedKey = "";
    class FailingVfs extends MemoryVfs {
      override async deleteKey(key: string): Promise<void> {
        if (failing && key === failedKey) throw new Error("disk says no");
        await super.deleteKey(key);
      }
    }
    const { vfs, ws, ada, bo, note, errors, sweep } = await world(
      new FailingVfs(),
    );
    failedKey = note(ada);
    await vfs.writeText(note(ada), "Gateway context");
    await vfs.writeText(note(bo), "Gateway context");
    await expect(sweep(true)).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(await vfs.readText(note(bo))).toBeNull();
    expect(await getPreference(vfs, ws.id, GATEWAY_NOTES_SWEPT_KEY)).toBeNull();
    failing = false;
    await sweep(true);
    expect(await vfs.readText(note(ada))).toBeNull();
    expect(await getPreference(vfs, ws.id, GATEWAY_NOTES_SWEPT_KEY)).toBe("1");
  });

  test("a store that cannot list workspaces does not fail boot", async () => {
    const { store, vfs, errors } = await world();
    store.listWorkspaces = async () => {
      throw new Error("store offline");
    };
    await expect(
      sweepGatewayGroupNotes({
        enginePod: true,
        store,
        vfs,
        paths: new CloudPaths(),
        log: (_message, error) => errors.push(error),
      }),
    ).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });
});
