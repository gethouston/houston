import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  ensureWorkspaceWithAssistant,
  type WorkspaceLike,
} from "../src/components/onboarding/ensure-default-assistant.ts";

type W = WorkspaceLike;
interface A {
  id: string;
}

/**
 * A fake engine that mimics the real dup-name guards: creating a workspace
 * or an agent whose name already exists throws a Conflict, exactly like
 * `houston-engine-core::workspaces::create` / `agents_crud::create`. If the
 * idempotency logic regresses, these fakes throw the same way prod does.
 */
function fakeEngine() {
  const workspaces: W[] = [];
  const agentsByWs: Record<string, A[]> = {};
  let wsSeq = 0;
  let agentSeq = 0;
  return {
    workspaces,
    agentsByWs,
    listWorkspaces: async () => workspaces.slice(),
    createWorkspace: async (name: string) => {
      if (workspaces.some((w) => w.name === name)) {
        throw new Error(`conflict: workspace named "${name}" already exists`);
      }
      const ws: W = { id: `ws-${++wsSeq}`, name };
      workspaces.push(ws);
      agentsByWs[ws.id] = [];
      return ws;
    },
    listAgents: async (workspaceId: string) =>
      (agentsByWs[workspaceId] ?? []).slice(),
    createAssistant: async (workspaceId: string) => {
      const a: A = { id: `agent-${++agentSeq}` };
      agentsByWs[workspaceId] ??= [];
      agentsByWs[workspaceId].push(a);
      return a;
    },
  };
}

describe("ensureWorkspaceWithAssistant (HOU-444)", () => {
  it("creates the workspace + assistant on first run", async () => {
    const e = fakeEngine();
    const r = await ensureWorkspaceWithAssistant("Personal", e);
    strictEqual(r.createdWorkspace, true);
    strictEqual(r.workspace.name, "Personal");
    strictEqual(e.workspaces.length, 1);
    strictEqual(e.agentsByWs[r.workspace.id].length, 1);
    strictEqual(r.assistant.id, e.agentsByWs[r.workspace.id][0].id);
  });

  it("is idempotent: a second run reuses the workspace + assistant, no conflict", async () => {
    const e = fakeEngine();
    const first = await ensureWorkspaceWithAssistant("Personal", e);
    // Re-running (double-fire / retry / remount) must NOT throw the dup-name
    // conflict and must NOT create a second workspace or assistant.
    const second = await ensureWorkspaceWithAssistant("Personal", e);
    strictEqual(second.createdWorkspace, false);
    strictEqual(second.workspace.id, first.workspace.id);
    strictEqual(second.assistant.id, first.assistant.id);
    strictEqual(e.workspaces.length, 1);
    strictEqual(e.agentsByWs[first.workspace.id].length, 1);
  });

  it("reuses a workspace left without an assistant by a partial prior run", async () => {
    const e = fakeEngine();
    // Simulate a first attempt that created the workspace but rejected before
    // the assistant was created.
    await e.createWorkspace("Personal");
    const r = await ensureWorkspaceWithAssistant("Personal", e);
    strictEqual(r.createdWorkspace, false);
    strictEqual(e.workspaces.length, 1);
    // The missing assistant is created on the retry.
    strictEqual(e.agentsByWs[r.workspace.id].length, 1);
    strictEqual(r.assistant.id, e.agentsByWs[r.workspace.id][0].id);
  });

  it("trims the workspace name before matching / creating", async () => {
    const e = fakeEngine();
    const r = await ensureWorkspaceWithAssistant("  Personal  ", e);
    strictEqual(r.workspace.name, "Personal");
    // A padded re-run resolves to the same workspace, not a second one.
    const again = await ensureWorkspaceWithAssistant("Personal ", e);
    strictEqual(again.createdWorkspace, false);
    strictEqual(again.workspace.id, r.workspace.id);
    strictEqual(e.workspaces.length, 1);
  });
});
