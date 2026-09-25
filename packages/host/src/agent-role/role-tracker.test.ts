import type { HoustonEvent } from "@houston/protocol";
import { beforeEach, expect, test, vi } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { DEFAULT_PATHS } from "../routes/agent-authz";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { AgentRoleTracker, RolePublishDeferredError } from "./role-tracker";

/**
 * The role each agent's listing names follows its job description, whoever
 * wrote it, and is announced only once the listing can serve it.
 */

let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let workspace: Workspace;
let agent: Agent;
let log: string[];
let published: Array<[string, string | undefined]>;

const brief = (role: string) =>
  `---\nindustry: Retail\nrole: ${role}\n---\n\nKeeps the shop running.`;

async function writeJob(text: string): Promise<void> {
  await vfs.writeText(
    `${DEFAULT_PATHS.agentRoot(workspace, agent)}/CLAUDE.md`,
    text,
  );
}

function tracker(
  publish?: (agentId: string, role: string | undefined) => Promise<void>,
): AgentRoleTracker {
  return new AgentRoleTracker({
    store,
    vfs,
    paths: DEFAULT_PATHS,
    announce: (event: HoustonEvent) => {
      log.push(
        `announce:${event.type}:${"agentPath" in event ? event.agentPath : ""}`,
      );
    },
    publish,
  });
}

const contextChanged = (): HoustonEvent => ({
  type: "ContextChanged",
  agentPath: agent.id,
});

beforeEach(async () => {
  store = new MemoryWorkspaceStore();
  vfs = new MemoryVfs();
  workspace = await store.getOrCreatePersonalWorkspace("alice");
  agent = await store.createAgent({ workspaceId: workspace.id, name: "Maya" });
  log = [];
  published = [];
});

test("a rewritten job description is published BEFORE it is announced", async () => {
  // The gateway lists roles from its own database: a client re-listing on the
  // announcement must already find the new role there.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const roles = tracker(async (agentId, role) => {
    log.push(`publish:${agentId}:${role}`);
    published.push([agentId, role]);
    await gate;
  });
  await writeJob(brief("Store manager"));
  roles.onEvent(contextChanged());
  await vi.waitFor(() => expect(published).toHaveLength(1));
  expect(log).toEqual([`publish:${agent.id}:Store manager`]);
  release();
  await roles.flush();
  expect(log).toEqual([
    `publish:${agent.id}:Store manager`,
    `announce:AgentRoleChanged:${agent.id}`,
  ]);
});

test("the agent rewriting its own role re-announces; an unchanged one stays quiet", async () => {
  const roles = tracker(async (agentId, role) => {
    published.push([agentId, role]);
  });
  await writeJob(brief("Store manager"));
  roles.onEvent(contextChanged());
  await roles.flush();
  // A change to another context file (or a body-only edit) moves no role.
  await writeJob(`${brief("Store manager")}\n\nMore detail.`);
  roles.onEvent(contextChanged());
  await roles.flush();
  await writeJob(brief("Operations lead"));
  roles.onEvent(contextChanged());
  await roles.flush();

  expect(published).toEqual([
    [agent.id, "Store manager"],
    [agent.id, "Operations lead"],
  ]);
  expect(log).toEqual([
    `announce:AgentRoleChanged:${agent.id}`,
    `announce:AgentRoleChanged:${agent.id}`,
  ]);
});

test("a description that names no role publishes none", async () => {
  const roles = tracker(async (agentId, role) => {
    published.push([agentId, role]);
  });
  await writeJob("# Notes\n\nNo brief here.");
  roles.onEvent(contextChanged());
  await roles.flush();
  expect(published).toEqual([[agent.id, undefined]]);
});

test("a failed publish announces nothing, and the next change retries it", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    let fail = true;
    const roles = tracker(async (agentId, role) => {
      if (fail) throw new Error("gateway down");
      published.push([agentId, role]);
    });
    await writeJob(brief("Store manager"));
    roles.onEvent(contextChanged());
    await roles.flush();
    expect(log).toEqual([]);
    expect(error).toHaveBeenCalledOnce();

    fail = false;
    roles.ensureTracked(agent.id);
    await roles.flush();
    expect(published).toEqual([[agent.id, "Store manager"]]);
    expect(log).toEqual([`announce:AgentRoleChanged:${agent.id}`]);
  } finally {
    error.mockRestore();
  }
});

test("a deferred role change is retried by the next addressed request", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    let defer = false;
    const roles = tracker(async (agentId, role) => {
      if (defer) throw new RolePublishDeferredError(agentId, "store down");
      published.push([agentId, role]);
    });
    await writeJob(brief("Store manager"));
    roles.onEvent(contextChanged());
    await roles.flush();

    defer = true;
    await writeJob(brief("Operations lead"));
    roles.onEvent(contextChanged());
    await roles.flush();
    // Nothing landed: nothing is announced, at warning level only.
    expect(log).toEqual([`announce:AgentRoleChanged:${agent.id}`]);
    expect(warn).toHaveBeenCalledOnce();

    defer = false;
    roles.ensureTracked(agent.id);
    await roles.flush();
    expect(published).toEqual([
      [agent.id, "Store manager"],
      [agent.id, "Operations lead"],
    ]);
    expect(log).toEqual([
      `announce:AgentRoleChanged:${agent.id}`,
      `announce:AgentRoleChanged:${agent.id}`,
    ]);
  } finally {
    warn.mockRestore();
  }
});

test("ensureTracked reads an agent once per process (per-request callers)", async () => {
  const roles = tracker(async (agentId, role) => {
    published.push([agentId, role]);
  });
  await writeJob(brief("Store manager"));
  roles.ensureTracked(agent.id);
  roles.ensureTracked(agent.id);
  await roles.flush();
  roles.ensureTracked(agent.id);
  await roles.flush();
  expect(published).toEqual([[agent.id, "Store manager"]]);
});

test("a host that serves its own listing announces without publishing", async () => {
  const roles = tracker();
  await writeJob(brief("Store manager"));
  roles.onEvent(contextChanged());
  roles.onEvent({ type: "FilesChanged", agentPath: agent.id });
  await roles.flush();
  expect(log).toEqual([`announce:AgentRoleChanged:${agent.id}`]);
});
