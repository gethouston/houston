import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { loadActivities, saveActivities } from "@houston/domain";
import { afterEach, expect, test, vi } from "vitest";
import { LocalPaths } from "../paths";
import type {
  CaptureResult,
  ChannelCtx,
  RuntimeChannel,
  RuntimeState,
} from "../ports";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { type AgentRouteDeps, handleAgents } from "./agents";
import { liveTurns } from "./live-turn";

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
});

/** The gateway's acting-as stamp for the person driving the pod. */
const ACTING = `acting-v1.${Buffer.from(
  JSON.stringify({ sub: "alice-sub", name: "Alice" }),
  "utf8",
).toString("base64url")}.sig`;

class RecordingChannel implements RuntimeChannel {
  readonly bodies: (string | undefined)[] = [];

  async dispatch(
    ctx: ChannelCtx,
    _method: string,
    _rest: string,
    _url: URL,
    _req: unknown,
    res: { writeHead: (s: number) => void; end: (chunk?: string) => void },
  ): Promise<void> {
    this.bodies.push(ctx.body?.toString("utf8"));
    res.writeHead(202);
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

async function boot() {
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
    gatewayFronted: true,
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    void handleAgents(
      deps,
      "alice",
      req.method || "GET",
      url.pathname,
      url,
      req,
      res,
    ).then((handled) => {
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
