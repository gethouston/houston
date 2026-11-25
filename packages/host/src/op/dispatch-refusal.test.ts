import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { LocalWorkspaceStore } from "../store/local";
import { FsVfs, LazyReadRefusedError, type Vfs } from "../vfs";
import { dispatchAgentOp } from "./dispatch";

/** The real tree, except every read refuses for `reason`. */
function refusingVfs(root: string, reason: LazyReadRefusedError["reason"]) {
  const inner = new FsVfs(root);
  const refuse = async (key: string): Promise<never> => {
    throw new LazyReadRefusedError(reason, key, 10, 5);
  };
  const vfs: Vfs = Object.assign(Object.create(inner) as FsVfs, {
    readText: refuse,
    readBytes: refuse,
  });
  return vfs;
}

async function dispatchRefused(reason: LazyReadRefusedError["reason"]) {
  const root = mkdtempSync(join(tmpdir(), "op-dispatch-refusal-"));
  const store = new LocalWorkspaceStore(root);
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "Bob",
  });
  return dispatchAgentOp({
    workspacesRoot: root,
    agentId: agent.id,
    vfs: refusingVfs(root, reason),
    request: { method: "GET", rest: "routines", triggersEnabled: false },
  });
}

test.each(["object", "total"] as const)(
  "a %s refusal answers 'too large' and flags tooLarge",
  async (reason) => {
    const res = await dispatchRefused(reason);
    expect(res.status).toBe(503);
    expect(res.tooLarge).toBe(true);
    expect(res.privateRefused).toBeUndefined();
    expect(JSON.parse(res.body)).toEqual({
      error: "file too large to fetch while the agent sleeps",
    });
  },
);

test("a private refusal gets its own answer, never 'too large'", async () => {
  const res = await dispatchRefused("private");
  expect(res.status).toBe(503);
  expect(res.privateRefused).toBe(true);
  expect(res.tooLarge).toBeUndefined();
  expect(JSON.parse(res.body)).toEqual({
    error: "sign-in state is unavailable while the agent sleeps",
    code: "private_state_refused",
  });
});
