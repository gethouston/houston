import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import {
  createRoutineRun,
  saveRoutineRuns,
  saveRoutines,
} from "@houston/domain";
import type { Capabilities, Routine } from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import type { ChannelCtx, RuntimeChannel, TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryTriggerStateStore } from "../triggers/state-store";
import { MemoryTurnBus } from "../turn/bus";
import { MemoryVfs } from "../vfs";
import { workspaceRoot } from "./agent-data";

/**
 * POST /v1/integrations/composio/webhook (C9 self-host ingress). Asserts a valid
 * signed delivery resolves its instance → routine and fires; a bad signature or
 * stale timestamp is 401; a verified-but-unknown instance is a silent 200 drop;
 * and an oversized payload is truncated before it reaches the run.
 */

const SECRET = "whsec_local";
const verifier: TokenVerifier = {
  async verify() {
    return null;
  },
};

class SpyChannel implements RuntimeChannel {
  fired: { text: string }[] = [];
  async dispatch() {}
  async fireTurn(_ctx: ChannelCtx, _cid: string, text: string) {
    this.fired.push({ text });
  }
  async cancelTurn() {
    return false;
  }
  async busy() {
    return false;
  }
  async runtimeStatus() {
    return "running" as const;
  }
  async teardown() {}
  async captureCredential() {
    return { ok: true as const, provider: "openai-codex" };
  }
  async forgetCredential() {}
  async saveApiKeyCredential() {}
  async saveClaudeOAuthCredential() {}
  async saveCustomEndpoint() {}
}

const CAPS: Capabilities = {
  profile: "local",
  revealInOs: true,
  terminal: true,
  tunnel: false,
  codeExecution: "local-bash",
  providers: [],
  openaiCompatible: true,
  integrations: ["composio"],
  triggers: true,
};

let server: Server;
let base = "";
let vfs: MemoryVfs;
let channel: SpyChannel;
let stateStore: MemoryTriggerStateStore;
let ws: Workspace;
let agent: Agent;

function signedRequest(
  bodyObj: unknown,
  over: { sig?: string; ts?: string } = {},
) {
  const id = "evt_1";
  const ts = over.ts ?? String(Math.floor(Date.now() / 1000));
  const raw = JSON.stringify(bodyObj);
  const sig =
    over.sig ??
    createHmac("sha256", SECRET).update(`${id}.${ts}.${raw}`).digest("base64");
  return fetch(`${base}/v1/integrations/composio/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": ts,
      "webhook-signature": sig,
    },
    body: raw,
  });
}

const event = (data: unknown, triggerId = "ti_1") => ({
  id: "evt_1",
  metadata: {
    trigger_id: triggerId,
    trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
    connected_account_id: "ca_1",
    user_id: "local-owner",
  },
  data,
  timestamp: String(Math.floor(Date.now() / 1000)),
});

const routine: Routine = {
  id: "r1",
  name: "Inbox",
  prompt: "check inbox",
  trigger: {
    toolkit: "gmail",
    trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
    trigger_config: {},
  },
  enabled: true,
  suppress_when_silent: false,
  chat_mode: "shared",
  integrations: [],
  created_at: "",
  updated_at: "",
};

beforeEach(async () => {
  const store = new MemoryWorkspaceStore();
  vfs = new MemoryVfs();
  channel = new SpyChannel();
  stateStore = new MemoryTriggerStateStore();
  ws = await store.getOrCreatePersonalWorkspace("local-owner");
  agent = await store.createAgent({ workspaceId: ws.id, name: "Helper" });
  await saveRoutines(vfs, workspaceRoot(ws, agent), [routine]);
  await stateStore.put(agent.id, {
    r1: { trigger_instance_id: "ti_1", config_hash: "h", status: "active" },
  });

  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    channels: { gke: channel },
    vfs,
    capabilities: CAPS,
    triggerLock: new MemoryTurnBus(),
    triggerState: stateStore,
    composioWebhookSecret: SECRET,
  };
  if (server) await new Promise<void>((r) => server.close(() => r()));
  server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

test("a valid signed delivery resolves its routine and fires", async () => {
  const res = await signedRequest(event({ subject: "hi" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ result: "fired", event_ids: ["evt_1"] });
  expect(channel.fired).toHaveLength(1);
  const text = channel.fired[0]?.text ?? "";
  expect(text).toContain("check inbox");
  expect(text).toContain("hi");
});

test("a bad signature is 401 and never fires", async () => {
  const res = await signedRequest(event({ subject: "hi" }), { sig: "wrong" });
  expect(res.status).toBe(401);
  expect(channel.fired).toHaveLength(0);
});

test("a stale timestamp is 401", async () => {
  const staleTs = String(Math.floor(Date.now() / 1000) - 400);
  const res = await signedRequest(event({}), { ts: staleTs });
  expect(res.status).toBe(401);
});

test("a verified but unknown instance id is a silent 200 drop", async () => {
  const res = await signedRequest(event({ subject: "hi" }, "ti_unknown"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ result: "dropped" });
  expect(channel.fired).toHaveLength(0);
});

test("a busy routine is answered non-2xx so Composio redelivers", async () => {
  // Seed an in-flight run so fireRoutineRun trips RoutineBusyError. On the busy
  // path fireTriggerEvents releases this batch's dedup locks — self-host has NO
  // pending-events queue, so a 200 ack would let Composio treat the event as
  // delivered and never redeliver it, losing the event permanently. The ingress
  // must answer non-2xx so Composio retries once the routine frees up.
  const running = createRoutineRun(
    routine,
    "run_inflight",
    new Date().toISOString(),
  );
  await saveRoutineRuns(vfs, workspaceRoot(ws, agent), [running]);

  const res = await signedRequest(event({ subject: "hi" }));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ result: "busy" });
  expect(channel.fired).toHaveLength(0);
});

test("an oversized payload is truncated before the run", async () => {
  const res = await signedRequest(event({ blob: "x".repeat(200_000) }));
  expect(res.status).toBe(200);
  const text = channel.fired[0]?.text ?? "";
  expect(text).toContain("_truncated");
  expect(text).not.toContain("x".repeat(200_000));
});

test("an over-1MiB body is rejected 413 before any signature work", async () => {
  // This route is unauthenticated internet-facing: the raw body is buffered
  // BEFORE the HMAC is checked. An attacker who knows the URL must not be able
  // to stream a multi-GB body into memory. The cap is enforced first, so even a
  // deliberately WRONG signature yields 413 (not 401) — proving the byte ceiling
  // gates the request ahead of verification — and the routine never fires.
  const huge = { data: "x".repeat(1_100_000) };
  const res = await signedRequest(huge, { sig: "wrong" });
  expect(res.status).toBe(413);
  expect(channel.fired).toHaveLength(0);
});
