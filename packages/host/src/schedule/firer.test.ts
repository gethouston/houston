import { expect, test } from "vitest";
import { ProxyChannel } from "../channel/proxy";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import type { ChannelCtx, RuntimeChannel, TurnPin } from "../ports";
import { startTestFetchServer } from "../testing/fetch-server";
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
function recordingChannel(): RuntimeChannel & {
  calls: {
    cid: string;
    text: string;
    pin?: TurnPin;
    actingUser?: string;
  }[];
} {
  const calls: {
    cid: string;
    text: string;
    pin?: TurnPin;
    actingUser?: string;
  }[] = [];
  return {
    calls,
    async dispatch() {},
    async fireTurn(
      _ctx: ChannelCtx,
      cid: string,
      text: string,
      pin?: TurnPin,
      actingUser?: string,
    ) {
      calls.push({ cid, text, pin, actingUser });
    },
    async cancelTurn() {
      return false;
    },
    async teardown() {},
    async captureCredential() {
      return { ok: true, provider: "openai-codex" };
    },
    async forgetCredential() {},
    async saveApiKeyCredential() {},
    async saveClaudeOAuthCredential() {},
    async saveCustomEndpoint() {},
  };
}

test("ChannelRoutineFirer routes the prompt to the workspace's channel", async () => {
  const cloudrun = recordingChannel();
  const firer = new ChannelRoutineFirer({ cloudrun });
  await firer.fire(job());
  expect(cloudrun.calls).toEqual([
    // No pins on this routine → all inherit. No created_by on a legacy
    // routine → no acting user threaded (acts as owner).
    {
      cid: "routine-r1",
      text: "Write the daily report",
      pin: { provider: null, model: null, effort: undefined },
      actingUser: undefined,
    },
  ]);
});

test("ChannelRoutineFirer threads the routine creator as the turn's acting user (C2)", async () => {
  const cloudrun = recordingChannel();
  const firer = new ChannelRoutineFirer({ cloudrun });
  await firer.fire(
    job({
      routine: {
        ...job().routine,
        created_by: "sub-alice",
      } as FiringJob["routine"],
    }),
  );
  expect(cloudrun.calls[0]?.actingUser).toBe("sub-alice");
});

test("ChannelRoutineFirer carries the routine's provider/model/effort pins", async () => {
  const cloudrun = recordingChannel();
  const firer = new ChannelRoutineFirer({ cloudrun });
  await firer.fire(
    job({
      routine: {
        ...job().routine,
        provider: "anthropic",
        model: "claude-opus-4-8",
        effort: "max",
      },
    }),
  );
  const call0 = cloudrun.calls[0];
  if (!call0) throw new Error("expected at least one fireTurn call");
  // THE pin: the provider rides the turn, so the routine keeps firing on its
  // own provider no matter what other chats/routines picked since.
  expect(call0.pin).toEqual({
    provider: "anthropic",
    model: "claude-opus-4-8",
    effort: "max",
  });
});

test("ChannelRoutineFirer maps a Rust-era provider pin to its pi id at fire time", async () => {
  const cloudrun = recordingChannel();
  const firer = new ChannelRoutineFirer({ cloudrun });
  // A migrated routines.json can still say "claude"/"codex" — the pin the turn
  // carries speaks pi ids, while the file on disk is never rewritten.
  await firer.fire(job({ routine: { ...job().routine, provider: "claude" } }));
  expect(cloudrun.calls[0]?.pin?.provider).toBe("anthropic");
});

test("an unresolvable provider pin fails the fire with the real reason, before any turn starts", async () => {
  const cloudrun = recordingChannel();
  const firer = new ChannelRoutineFirer({ cloudrun });
  // routinePin passes unknown ids through verbatim (never a silent switch);
  // the firer must reject them HERE so the run errors immediately with the
  // reason — firing anyway would die inside the runtime as an ephemeral
  // stream error and the run would time out vague 15 minutes later.
  await expect(
    firer.fire(job({ routine: { ...job().routine, provider: "gemini-cli" } })),
  ).rejects.toThrow("unknown provider: gemini-cli");
  expect(cloudrun.calls).toHaveLength(0);
});

test("a missing channel for the workspace's runtime throws (→ errored run)", async () => {
  const firer = new ChannelRoutineFirer({}); // nothing wired
  await expect(firer.fire(job({ workspace: ws("cloudrun") }))).rejects.toThrow(
    "cloudrun runtime not configured",
  );
});

test("ProxyChannel.fireTurn posts the prompt to the runtime's conversation endpoint", async () => {
  // Held in an object so the fetch-closure write survives the outer
  // control-flow analysis (a bare `let` would be narrowed to its `null` init).
  const captured: {
    seen: { path: string; body: unknown; auth: string | null } | null;
  } = { seen: null };
  const runtime = await startTestFetchServer(async (req) => {
    const u = new URL(req.url);
    captured.seen = {
      path: u.pathname,
      body: await req.json(),
      auth: req.headers.get("authorization"),
    };
    return Response.json({ ok: true, id: "routine-r1" }, { status: 202 });
  });
  const launcher = {
    async ensureAwake() {
      return {
        baseUrl: runtime.baseUrl,
        token: "sbx-token",
      };
    },
    async sleep() {},
    async destroy() {},
    async status() {
      return "running" as const;
    },
  };
  const channel = new ProxyChannel({
    launcher,
    proxy: { async forward() {} },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });
  try {
    await channel.fireTurn(
      { workspace: ws("gke"), agent },
      "routine-r1",
      "Write the daily report",
    );
    const seen = captured.seen;
    if (!seen) throw new Error("expected runtime to receive a request");
    expect(seen.path).toBe("/conversations/routine-r1/messages");
    expect(seen.body).toEqual({ text: "Write the daily report" });
    expect(seen.auth).toBe("Bearer sbx-token");
  } finally {
    await runtime.stop();
  }
});

test("ProxyChannel.fireTurn includes the routine's model/effort pins in the message body", async () => {
  let body: unknown = null;
  const runtime = await startTestFetchServer(async (req) => {
    body = await req.json();
    return Response.json({ ok: true, id: "routine-r1" }, { status: 202 });
  });
  const launcher = {
    async ensureAwake() {
      return { baseUrl: runtime.baseUrl, token: "t" };
    },
    async sleep() {},
    async destroy() {},
    async status() {
      return "running" as const;
    },
  };
  const channel = new ProxyChannel({
    launcher,
    proxy: { async forward() {} },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });
  try {
    await channel.fireTurn(
      { workspace: ws("gke"), agent },
      "routine-r1",
      "go",
      {
        provider: "openai-codex",
        model: "gpt-5.5",
        effort: "high",
      },
    );
    expect(body).toEqual({
      text: "go",
      provider: "openai-codex",
      model: "gpt-5.5",
      effort: "high",
    });
  } finally {
    await runtime.stop();
  }
});

test("ProxyChannel.fireTurn sends x-houston-acting-user when a creator is threaded, omits it otherwise", async () => {
  const seen: { actingUser: string | null }[] = [];
  const runtime = await startTestFetchServer(async (req) => {
    seen.push({ actingUser: req.headers.get("x-houston-acting-user") });
    return Response.json({ ok: true }, { status: 202 });
  });
  const launcher = {
    async ensureAwake() {
      return { baseUrl: runtime.baseUrl, token: "t" };
    },
    async sleep() {},
    async destroy() {},
    async status() {
      return "running" as const;
    },
  };
  const channel = new ProxyChannel({
    launcher,
    proxy: { async forward() {} },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });
  try {
    // Routine turn with a creator → the header carries the sub.
    await channel.fireTurn(
      { workspace: ws("gke"), agent },
      "c1",
      "go",
      undefined,
      "sub-alice",
    );
    expect(seen[0]?.actingUser).toBe("sub-alice");
    // Legacy routine (no creator) → the header is absent.
    await channel.fireTurn({ workspace: ws("gke"), agent }, "c1", "go");
    expect(seen[1]?.actingUser).toBeNull();
  } finally {
    await runtime.stop();
  }
});

test("ProxyChannel.fireTurn throws when the runtime rejects (→ errored run)", async () => {
  const runtime = await startTestFetchServer(
    () => new Response("boom", { status: 500 }),
  );
  const launcher = {
    async ensureAwake() {
      return { baseUrl: runtime.baseUrl, token: "t" };
    },
    async sleep() {},
    async destroy() {},
    async status() {
      return "running" as const;
    },
  };
  const channel = new ProxyChannel({
    launcher,
    proxy: { async forward() {} },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });
  try {
    await expect(
      channel.fireTurn({ workspace: ws("gke"), agent }, "c1", "hi"),
    ).rejects.toThrow("runtime 500");
  } finally {
    await runtime.stop();
  }
});

test("ProxyChannel.cancelTurn answers false for an asleep runtime without waking it", async () => {
  // Asleep ⇒ no turn can be in flight (turns live inside the runtime process);
  // paying a cold start just to hear cancelled:false would add seconds + spend
  // to the user's Stop click on a stale row.
  const calls: string[] = [];
  const launcher = {
    async ensureAwake(): Promise<{ baseUrl: string; token: string }> {
      calls.push("ensureAwake");
      throw new Error("must not wake an asleep runtime for a cancel");
    },
    async sleep() {},
    async destroy() {},
    async status() {
      calls.push("status");
      return "asleep" as const;
    },
  };
  const channel = new ProxyChannel({
    launcher,
    proxy: { async forward() {} },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });
  await expect(
    channel.cancelTurn({ workspace: ws("gke"), agent }, "routine-r1"),
  ).resolves.toBe(false);
  expect(calls).toEqual(["status"]);
});

test("ProxyChannel.cancelTurn cancels through a running runtime and reports the outcome", async () => {
  const runtime = await startTestFetchServer(async (req) => {
    const u = new URL(req.url);
    if (u.pathname === "/conversations/routine-r1/cancel")
      return Response.json({ ok: true, cancelled: true });
    return Response.json({ error: "unexpected" }, { status: 500 });
  });
  const launcher = {
    async ensureAwake() {
      return { baseUrl: runtime.baseUrl, token: "t" };
    },
    async sleep() {},
    async destroy() {},
    async status() {
      return "running" as const;
    },
  };
  const channel = new ProxyChannel({
    launcher,
    proxy: { async forward() {} },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });
  try {
    await expect(
      channel.cancelTurn({ workspace: ws("gke"), agent }, "routine-r1"),
    ).resolves.toBe(true);
  } finally {
    await runtime.stop();
  }
});
