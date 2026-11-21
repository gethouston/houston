import { afterEach, expect, test, vi } from "vitest";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { matchAgentRefs } from "./agent-refs";
import {
  localMissionDirectory,
  missionTargetDirectory,
} from "./missions-directory";
import { gatewayMissionDirectory } from "./missions-directory-gateway";
import type { MissionsCtx, MissionsSandboxDeps } from "./missions-sandbox";

const gateway = { url: "https://gw.test", token: "gw-token" };

async function ctxFor(
  opts: { gatewayFronted?: boolean } = {},
): Promise<MissionsCtx> {
  const store = new MemoryWorkspaceStore({ defaultRuntime: "local" });
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "Helper" });
  await store.createAgent({ workspaceId: ws.id, name: "Writer" });
  const deps = {
    store,
    channels: {},
    ...(opts.gatewayFronted ? { gatewayFronted: true } : {}),
  } as unknown as MissionsSandboxDeps;
  return {
    deps,
    ws,
    agent,
    vfs: new MemoryVfs(),
    root: "root",
    paths: { agentRoot: () => "root" } as unknown as MissionsCtx["paths"],
  };
}

function listing(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

test("the local directory includes the caller for explicit self resolution", async () => {
  const result = await localMissionDirectory(await ctxFor()).list();
  expect(result.ok && result.candidates).toEqual([
    expect.objectContaining({ name: "Helper", remote: false }),
    expect.objectContaining({ name: "Writer", remote: false }),
  ]);
});

test("an agent can name its own board", async () => {
  const ctx = await ctxFor();
  const { resolveMissionRoute } = await import("./missions-target");
  const result = await resolveMissionRoute(ctx, ctx.agent.name);
  expect(result).toMatchObject({ ok: true, remote: false });
  if (result.ok && !result.remote)
    expect(result.ctx.agent.id).toBe(ctx.agent.id);
});

test("a candidate is a reference the shared ladder resolves", async () => {
  const result = await localMissionDirectory(await ctxFor()).list();
  if (!result.ok) throw new Error("expected a directory");
  const writer = result.candidates.find(
    (candidate) => candidate.name === "Writer",
  );
  if (!writer) throw new Error("expected a candidate");
  for (const ref of [
    writer.id,
    "writer",
    `${writer.workspace}/WRITER`,
    `${writer.workspaceId}/Writer`,
  ]) {
    expect(matchAgentRefs(result.candidates, ref)).toEqual([writer]);
  }
});

test("the gateway directory maps the agents the user owns", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify([
        { id: "slug-1", name: "Dobby", workspaceId: "Houston" },
        { id: "slug-2", name: "Winky", workspaceId: "Houston" },
        { nonsense: true },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;

  const result = await gatewayMissionDirectory(gateway, {
    fetchImpl,
  }).list();
  expect(calls).toEqual(["https://gw.test/agents"]);
  expect(result.ok && result.candidates).toEqual([
    {
      remote: true,
      id: "slug-1",
      name: "Dobby",
      workspace: "Houston",
      workspaceId: "Houston",
    },
    {
      remote: true,
      id: "slug-2",
      name: "Winky",
      workspace: "Houston",
      workspaceId: "Houston",
    },
  ]);
});

test("an unreadable gateway is an error, never an empty directory", async () => {
  for (const impl of [
    listing({ error: "nope" }, 500),
    listing({ notAnArray: true }),
    (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch,
  ]) {
    const result = await gatewayMissionDirectory(gateway, {
      fetchImpl: impl,
    }).list();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("agents_unreadable");
  }
});

test("gateway delegation refusals keep their typed code and useful sentence", async () => {
  const result = await gatewayMissionDirectory(gateway, {
    fetchImpl: listing({ code: "delegation_off", error: "gateway text" }, 403),
  }).list();
  expect(result).toMatchObject({
    ok: false,
    status: 403,
    code: "delegation_off",
    error:
      "You're not set up to work with other AI Employees. If the user wants this, they can turn it on in your settings under Teamwork.",
  });
});

test("a fronted pod lists both sides; an unfronted host stays local", async () => {
  const fetchImpl = listing([{ id: "slug-1", name: "Dobby" }]);
  const fronted = await missionTargetDirectory(
    await ctxFor({ gatewayFronted: true }),
    { gateway, fetchImpl },
  ).list();
  expect(fronted.ok && fronted.candidates.map((c) => c.name)).toEqual([
    "Helper",
    "Writer",
    "Dobby",
  ]);

  const desktop = await missionTargetDirectory(await ctxFor()).list();
  expect(desktop.ok && desktop.candidates.map((c) => c.name)).toEqual([
    "Helper",
    "Writer",
  ]);
});

afterEach(() => vi.unstubAllEnvs());
test("the coordinator is excluded by identity even with a public name", async () => {
  vi.stubEnv("HOUSTON_MANAGED_CLOUD", "1");
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "owner");
  const ctx = await ctxFor({ gatewayFronted: true });
  expect(await localMissionDirectory(ctx).list()).toEqual({
    ok: true,
    candidates: [expect.objectContaining({ name: "Writer" })],
  });
});
test("ambiguous remote names include their distinct ids", async () => {
  const { resolveMissionRoute } = await import("./missions-target");
  const result = await resolveMissionRoute(await ctxFor(), "Dobby", {
    gateway,
    fetchImpl: listing([
      { id: "dobby-1", name: "Dobby", workspaceId: "Houston" },
      { id: "dobby-2", name: "Dobby", workspaceId: "Houston" },
    ]),
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain("id dobby-1");
  expect(result.error).toContain("id dobby-2");
});

test("a coordinator cannot select its own board by omitting the target", async () => {
  vi.stubEnv("HOUSTON_MANAGED_CLOUD", "1");
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "owner");
  const { resolveMissionRoute } = await import("./missions-target");
  const result = await resolveMissionRoute(
    await ctxFor({ gatewayFronted: true }),
    undefined,
  );
  expect(result.ok).toBe(false);
});
