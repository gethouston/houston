import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { loadActivities, saveActivities } from "@houston/domain";
import { messageRetryContent } from "@houston/protocol";
import { messageAdmissionFileName } from "@houston/protocol/message-admission-file";
import { afterEach, expect, test, vi } from "vitest";
import { assistantApprovals } from "../assistant/approvals";
import { LocalPaths } from "../paths";
import type {
  CaptureResult,
  ChannelCtx,
  RuntimeChannel,
  RuntimeState,
} from "../ports";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import type { AgentRouteDeps } from "./agent-authz";
import { liveTurns } from "./live-turn";
import { dispatchGroup } from "./registry/all";

/**
 * THE SEND ITSELF, on the deployment where the most reads it: a managed
 * assistant pod, where the gateway stamps an acting-as header on EVERY request
 * and the one agent is the coordinator.
 *
 * The turn body is drained by the host on its way through - for the mode pin,
 * for the @mentions, for the approval receipts - and an HTTP request body can
 * only be read ONCE. So each of those seams must reuse the buffer the first one
 * took; a second `readBody` on the same request returns nothing, and what
 * reaches the runtime is an empty message.
 */

const paths = new LocalPaths();

afterEach(() => {
  vi.unstubAllEnvs();
  assistantApprovals.clear();
});

/** The gateway's acting-as stamp for the person driving the pod. */
const ACTING = `acting-v1.${Buffer.from(
  JSON.stringify({ sub: "alice-sub", name: "Alice" }),
  "utf8",
).toString("base64url")}.sig`;

class RecordingChannel implements RuntimeChannel {
  readonly bodies: (string | undefined)[] = [];
  status = 202;

  async dispatch(
    ctx: ChannelCtx,
    _method: string,
    _rest: string,
    _url: URL,
    _req: unknown,
    res: { writeHead: (s: number) => void; end: (chunk?: string) => void },
  ): Promise<void> {
    this.bodies.push(ctx.body?.toString("utf8"));
    res.writeHead(this.status);
    res.end("{}");
  }
  async fireTurn(): Promise<void> {}
  async cancelTurn(): Promise<boolean> {
    return false;
  }
  async busy(): Promise<boolean> {
    return false;
  }
  async runtimeStatus(): Promise<RuntimeState | "unknown"> {
    return "unknown";
  }
  async teardown(): Promise<void> {}
  async captureCredential(): Promise<CaptureResult> {
    return { ok: true, provider: "anthropic" };
  }
  async saveApiKeyCredential(): Promise<void> {}
  async saveClaudeOAuthCredential(): Promise<void> {}
  async saveCustomEndpoint(): Promise<void> {}
  async forgetCredential(): Promise<void> {}
}

async function boot(fronted = true) {
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  // The coordinator on a POD: an ordinarily-named single agent, told apart by
  // the identity the gateway stamped into the pod's environment
  // (launcher/assistant-role.ts). Its send is the one the host reads a mode
  // pin out of.
  vi.stubEnv("HOUSTON_MANAGED_CLOUD", "1");
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "alice-sub");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "Assistant",
  });
  const vfs = new MemoryVfs();
  const root = paths.agentRoot(workspace, agent);
  await saveActivities(vfs, root, [
    {
      id: "m1",
      title: "Launch",
      description: "",
      status: "running",
      session_key: "conv-1",
    },
  ]);
  const channel = new RecordingChannel();
  const deps: AgentRouteDeps = {
    store,
    channels: { gke: channel },
    vfs,
    paths,
    gatewayFronted: fronted,
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    void dispatchGroup("agent-proxy", {
      deps,
      userId: "alice",
      method: req.method || "GET",
      path: url.pathname,
      url,
      req,
      res,
    }).then((handled) => {
      if (!handled) {
        res.writeHead(404);
        res.end();
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => server.close(),
    channel,
    agent,
    vfs,
    root,
  };
}

test("a fronted coordinator send reaches the runtime whole", async () => {
  const fx = await boot();
  try {
    liveTurns.forget(fx.agent.id);
    const res = await fetch(
      `${fx.base}/agents/${encodeURIComponent(fx.agent.id)}/conversations/conv-1/messages`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer alice",
          "Content-Type": "application/json",
          "x-houston-acting-as": ACTING,
        },
        body: JSON.stringify({
          text: "Book the venue",
          mode: "plan",
          mentions: [{ userId: "bob-sub", name: "Bob" }],
        }),
      },
    );
    expect(res.status).toBe(202);

    // 1. The runtime got the message, not an empty body.
    expect(fx.channel.bodies).toHaveLength(1);
    expect(JSON.parse(fx.channel.bodies[0] ?? "{}")).toMatchObject({
      text: "Book the venue",
      mode: "plan",
    });

    // 2. The mode pin was read from that same buffer, so the host's own plan
    //    gate sees what the user asked for.
    expect(liveTurns.get(fx.agent.id, "conv-1")?.mode).toBe("plan");

    // 3. So were the mentions, and the acting human recorded with the turn.
    const { items } = await loadActivities(fx.vfs, fx.root);
    expect(items[0]?.contributors).toEqual([
      { user_id: "alice-sub", name: "Alice" },
    ]);
    expect(items[0]?.mentioned?.map((m) => m.user_id)).toEqual(["bob-sub"]);
    expect(liveTurns.get(fx.agent.id, "conv-1")?.actingAs).toBe(ACTING);
  } finally {
    liveTurns.forget(fx.agent.id);
    fx.close();
  }
});

async function send(
  fx: Awaited<ReturnType<typeof boot>>,
  body: Record<string, unknown>,
  acting: string | null = ACTING,
) {
  return fetch(
    `${fx.base}/agents/${encodeURIComponent(fx.agent.id)}/conversations/conv-1/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(acting === null ? {} : { "x-houston-acting-as": acting }),
      },
      body: JSON.stringify(body),
    },
  );
}

test("a desktop send is read and stripped by the host too, gateway or not", async () => {
  // Approvals are host-owned wherever the host runs, so the turn body is
  // drained on EVERY deployment - only the Teams attribution that follows is
  // gated on a gateway having vouched for the actor.
  const fx = await boot(false);
  try {
    const request = assistantApprovals.issue({
      agentId: fx.agent.id,
      conversationId: "conv-1",
      operation: "deleteAgent",
      params: {},
      summary: "Delete target",
    });
    expect(
      (
        await send(
          fx,
          {
            text: "yes",
            approvals: [{ requestId: request.requestId, decision: "approve" }],
          },
          null,
        )
      ).status,
    ).toBe(202);
    expect(fx.channel.bodies.at(-1)).toContain("yes");
    expect(fx.channel.bodies.at(-1)).not.toContain("approvals");
    expect(
      assistantApprovals.consume({
        agentId: fx.agent.id,
        conversationId: "conv-1",
        requestId: request.requestId,
        operation: "deleteAgent",
        params: {},
      }),
    ).toBe("approved");
  } finally {
    liveTurns.forget(fx.agent.id);
    fx.close();
  }
});

test("nonce conflicts cannot mutate host receipts or the active turn", async () => {
  const fx = await boot();
  try {
    expect(
      (await send(fx, { text: "original", nonce: "n", mode: "plan" })).status,
    ).toBe(202);
    const request = assistantApprovals.issue({
      agentId: fx.agent.id,
      conversationId: "conv-1",
      operation: "deleteAgent",
      params: {},
      summary: "Delete target",
    });
    const response = await send(fx, {
      text: "yes",
      nonce: "n",
      mode: "auto",
      approvals: [{ requestId: request.requestId, decision: "approve" }],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "nonce_conflict" });
    expect(fx.channel.bodies).toHaveLength(1);
    expect(
      assistantApprovals.pending(request.requestId, fx.agent.id, "conv-1"),
    ).toBeDefined();
    expect(liveTurns.get(fx.agent.id, "conv-1")?.mode).toBe("plan");
    const other = `acting-v1.${Buffer.from(JSON.stringify({ sub: "other-user" })).toString("base64url")}.sig`;
    expect(
      (await send(fx, { text: "original", nonce: "n", mode: "plan" }, other))
        .status,
    ).toBe(409);
  } finally {
    liveTurns.forget(fx.agent.id);
    fx.close();
  }
});

test("retrying a prompt preserves the approval it raised and forwards no receipts", async () => {
  const fx = await boot();
  try {
    const body = { text: "original", nonce: "n" };
    await send(fx, body);
    const request = assistantApprovals.issue({
      agentId: fx.agent.id,
      conversationId: "conv-1",
      operation: "deleteAgent",
      params: {},
      summary: "Delete target",
    });
    expect((await send(fx, body)).status).toBe(202);
    expect(
      assistantApprovals.pending(request.requestId, fx.agent.id, "conv-1"),
    ).toBeDefined();
    const answer = {
      text: "yes",
      nonce: "answer",
      approvals: [{ requestId: request.requestId, decision: "approve" }],
    };
    await send(fx, answer);
    await send(fx, answer);
    expect(fx.channel.bodies.at(-1)).not.toContain("approvals");
    expect(
      assistantApprovals.consume({
        agentId: fx.agent.id,
        conversationId: "conv-1",
        requestId: request.requestId,
        operation: "deleteAgent",
        params: {},
      }),
    ).toBe("approved");
  } finally {
    liveTurns.forget(fx.agent.id);
    fx.close();
  }
});

test("a definite runtime refusal releases host nonce admission", async () => {
  const fx = await boot();
  try {
    fx.channel.status = 409;
    expect((await send(fx, { text: "first", nonce: "n" })).status).toBe(409);
    fx.channel.status = 202;
    expect((await send(fx, { text: "corrected", nonce: "n" })).status).toBe(
      202,
    );
    expect(fx.channel.bodies).toHaveLength(2);
  } finally {
    liveTurns.forget(fx.agent.id);
    fx.close();
  }
});

test.each([
  "expiry",
  "restart",
])("%s of the host memory guard still honors durable admission before touching a new card", async (reset) => {
  const fx = await boot();
  try {
    const body = { text: "original", nonce: "old" };
    await send(fx, body);
    const digest = (value: string) =>
      createHash("sha256").update(value).digest("hex");
    await fx.vfs.writeText(
      `${fx.agent.id}/.houston/runtime/${messageAdmissionFileName("conv-1", "old")}`,
      JSON.stringify({
        version: 1,
        fingerprint: "a".repeat(64),
        turnId: "accepted",
        hostFingerprint: digest(messageRetryContent(body, "alice-sub")),
      }),
    );
    if (reset === "expiry")
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + 11 * 60_000);
    else assistantApprovals.clear();
    const request = assistantApprovals.issue({
      agentId: fx.agent.id,
      conversationId: "conv-1",
      operation: "deleteAgent",
      params: {},
      summary: "New approval",
    });
    expect((await send(fx, body)).status).toBe(202);
    expect(
      assistantApprovals.pending(request.requestId, fx.agent.id, "conv-1"),
    ).toBeDefined();
    expect((await send(fx, { ...body, text: "changed" })).status).toBe(409);
    expect(
      assistantApprovals.pending(request.requestId, fx.agent.id, "conv-1"),
    ).toBeDefined();
  } finally {
    vi.restoreAllMocks();
    liveTurns.forget(fx.agent.id);
    fx.close();
  }
});
