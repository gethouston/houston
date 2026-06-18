import { test, expect } from "bun:test";
import type { ChannelCtx, RuntimeChannel } from "../ports";
import type { Agent, Workspace } from "../domain/types";
import { ProxyChannel } from "../channel/proxy";
import { MemoryCredentialStore } from "../credentials/store";
import { ChannelRoutineFirer } from "./firer";
import type { FiringJob } from "./scheduler";

/**
 * The routine firer routes a due job through the SAME per-workspace channel a
 * user message uses, and ProxyChannel.fireTurn posts the prompt to the standing
 * runtime's conversation endpoint exactly as a typed message would.
 */

const ws = (runtime: Workspace["runtime"]): Workspace => ({
  id: "w1",
  ownerUserId: "alice",
  kind: "personal",
  name: "W",
  slug: "w1",
  runtime,
  createdAt: 0,
});
const agent: Agent = { id: "a1", workspaceId: "w1", name: "A", createdAt: 0 };

function job(over: Partial<FiringJob> = {}): FiringJob {
  return {
    workspace: ws("cloudrun"),
    agent,
    routine: {
      id: "r1",
      name: "R",
      description: "",
      prompt: "Write the daily report",
      schedule: "0 9 * * *",
      enabled: true,
      suppress_when_silent: false,
      chat_mode: "shared",
      timezone: null,
      integrations: [],
      created_at: "",
      updated_at: "",
    },
    conversationId: "routine-r1",
    runId: "run-1",
    ...over,
  };
}

/** A channel that records fireTurn calls; the other verbs are unused here. */
function recordingChannel(): RuntimeChannel & { calls: { cid: string; text: string }[] } {
  const calls: { cid: string; text: string }[] = [];
  return {
    calls,
    async dispatch() {},
    async fireTurn(_ctx: ChannelCtx, cid: string, text: string) {
      calls.push({ cid, text });
    },
    async teardown() {},
    async captureCredential() {
      return { ok: true, provider: "openai-codex" };
    },
    async forgetCredential() {},
  };
}

test("ChannelRoutineFirer routes the prompt to the workspace's channel", async () => {
  const cloudrun = recordingChannel();
  const firer = new ChannelRoutineFirer({ cloudrun });
  await firer.fire(job());
  expect(cloudrun.calls).toEqual([{ cid: "routine-r1", text: "Write the daily report" }]);
});

test("a missing channel for the workspace's runtime throws (→ errored run)", async () => {
  const firer = new ChannelRoutineFirer({}); // nothing wired
  await expect(firer.fire(job({ workspace: ws("cloudrun") }))).rejects.toThrow("cloudrun runtime not configured");
});

test("ProxyChannel.fireTurn posts the prompt to the runtime's conversation endpoint", async () => {
  let seen: { path: string; body: unknown; auth: string | null } | null = null;
  const runtime = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const u = new URL(req.url);
      seen = { path: u.pathname, body: await req.json(), auth: req.headers.get("authorization") };
      return Response.json({ ok: true, id: "routine-r1" }, { status: 202 });
    },
  });
  const launcher = {
    async ensureAwake() {
      return { baseUrl: `http://127.0.0.1:${runtime.port}`, token: "sbx-token" };
    },
    async sleep() {},
    async destroy() {},
    async status() {
      return "running" as const;
    },
  };
  const channel = new ProxyChannel({ launcher, proxy: { async forward() {} }, credentials: new MemoryCredentialStore() });
  try {
    await channel.fireTurn({ workspace: ws("gke"), agent }, "routine-r1", "Write the daily report");
    expect(seen!.path).toBe("/conversations/routine-r1/messages");
    expect(seen!.body).toEqual({ text: "Write the daily report" });
    expect(seen!.auth).toBe("Bearer sbx-token");
  } finally {
    runtime.stop(true);
  }
});

test("ProxyChannel.fireTurn throws when the runtime rejects (→ errored run)", async () => {
  const runtime = Bun.serve({ port: 0, fetch: () => new Response("boom", { status: 500 }) });
  const launcher = {
    async ensureAwake() {
      return { baseUrl: `http://127.0.0.1:${runtime.port}`, token: "t" };
    },
    async sleep() {},
    async destroy() {},
    async status() {
      return "running" as const;
    },
  };
  const channel = new ProxyChannel({ launcher, proxy: { async forward() {} }, credentials: new MemoryCredentialStore() });
  try {
    await expect(channel.fireTurn({ workspace: ws("gke"), agent }, "c1", "hi")).rejects.toThrow("runtime 500");
  } finally {
    runtime.stop(true);
  }
});
