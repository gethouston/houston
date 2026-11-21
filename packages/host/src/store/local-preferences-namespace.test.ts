import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setPreference } from "@houston/domain";
import { expect, test } from "vitest";
import { agentRoots } from "../migrate/chat-history";
import { sweepGatewayGroupNotes } from "../migrate/gateway-group-notes";
import { LocalPaths } from "../paths";
import { FsVfs } from "../vfs";
import { LocalWorkspaceStore } from "./local";

function podTree() {
  const root = mkdtempSync(join(tmpdir(), "houston-pod-"));
  mkdirSync(join(root, "Personal", "prime"), { recursive: true });
  const store = new LocalWorkspaceStore(root);
  const vfs = new FsVfs(root);
  const errors: unknown[] = [];
  const sweep = () =>
    sweepGatewayGroupNotes({
      enginePod: true,
      store,
      vfs,
      paths: new LocalPaths(),
      log: (_message, error) => errors.push(error),
    });
  return { root, store, vfs, errors, sweep };
}

test("the boot sweep's preferences doc never becomes an agent", async () => {
  const { root, store, errors, sweep } = podTree();

  await sweep();

  expect(existsSync(join(root, "ws", "Personal", "preferences.json"))).toBe(
    true,
  );
  expect((await store.listWorkspaces()).map((ws) => ws.id)).toEqual([
    "Personal",
  ]);
  expect((await store.listAllAgents()).map((a) => a.id)).toEqual([
    "Personal/prime",
  ]);
  expect(await store.listAgents("ws")).toEqual([]);
  expect(await store.getWorkspace("ws")).toBeNull();
  expect(await store.getAgent("ws/Personal")).toBeNull();
  expect(agentRoots(root)).toEqual([join(root, "Personal", "prime")]);
  expect(errors).toEqual([]);
});

test("a second boot does not recurse into the preferences namespace", async () => {
  const { root, sweep } = podTree();

  await sweep();
  await sweep();

  expect(existsSync(join(root, "ws", "ws"))).toBe(false);
});

test("the personal workspace is never the preferences namespace", async () => {
  const root = mkdtempSync(join(tmpdir(), "houston-desktop-"));
  const vfs = new FsVfs(root);
  await setPreference(vfs, "Personal", "locale", "es");
  const store = new LocalWorkspaceStore(root);

  expect((await store.getOrCreatePersonalWorkspace("local-owner")).id).toBe(
    "Personal",
  );
});
