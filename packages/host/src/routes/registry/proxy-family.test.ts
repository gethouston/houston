import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { expect, test } from "vitest";
import { MemoryWorkspaceStore } from "../../store/memory";
import type { AgentRouteDeps } from "../agent-authz";
import { dispatchGroup, listRoutes } from "./all";
import { defineProxyFamily } from "./index";

/**
 * `defineProxyFamily` is how the catch-all forward to an agent's own runtime
 * stays enumerable: matching is still `*rest`, so an unlisted rest reaches the
 * channel all the same, while the declared members are what the SDK parity
 * gate reads. This file registers one into the live registry — vitest
 * isolates a file's module graph, so the extra routes exist only here.
 */
const SOURCE = "packages/host/src/routes/registry/proxy-family.test.ts";

const MEMBERS = [
  { method: "GET", path: "providers" },
  { method: "POST", path: "conversations/:conversationId/messages" },
] as const;

const seen: { rest: string; method: string }[] = [];

defineProxyFamily({
  group: "agent-activity",
  path: "/agents/:agentId/*rest",
  phase: "agent",
  classification: "runtime-proxy",
  reason:
    "Served by the agent's own runtime; this host only forwards the request and streams the answer back.",
  source: SOURCE,
  members: MEMBERS.map((member) => ({
    method: member.method,
    rest: member.path,
  })),
  async handler({ rest, method }) {
    seen.push({ rest, method });
  },
});

function request(): IncomingMessage {
  return Object.assign(Readable.from([]), { headers: {} }) as IncomingMessage;
}

function response() {
  const out = {
    status: 0,
    body: "",
    writeHead(status: number) {
      out.status = status;
      return out;
    },
    end(chunk?: unknown) {
      out.body = chunk ? String(chunk) : "";
      return out;
    },
  };
  return out as unknown as ServerResponse & typeof out;
}

async function host(): Promise<{ deps: AgentRouteDeps; agentId: string }> {
  const store = new MemoryWorkspaceStore();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "Proxied",
  });
  return { deps: { store, channels: {} }, agentId: agent.id };
}

const dispatch = async (
  deps: AgentRouteDeps,
  method: string,
  path: string,
  who = "alice",
) => {
  const res = response();
  const handled = await dispatchGroup("agent-activity", {
    deps,
    userId: who,
    method,
    path,
    url: new URL(path, "http://host.local"),
    req: request(),
    res,
  });
  return { handled, res };
};

test("listRoutes() publishes one entry per declared member", () => {
  // Scoped to the family declared here: the real one (routes/agents.ts) is in
  // the same registry, and its members are agents-proxy-members.test.ts's.
  const proxied = listRoutes().filter(
    (route) =>
      route.classification === "runtime-proxy" && route.source === SOURCE,
  );
  expect(proxied.map((route) => `${route.method} ${route.path}`)).toEqual([
    "GET /agents/:agentId/providers",
    "POST /agents/:agentId/conversations/:conversationId/messages",
  ]);
});

test("any method on any rest reaches the family, with the rest raw", async () => {
  const { deps, agentId } = await host();
  // Undeclared rest, undeclared method: the chain forwards it, so the family
  // claims it too — the member list is for the gate, not for the match.
  const { handled } = await dispatch(
    deps,
    "PATCH",
    `/agents/${agentId}/files/a%2Fb`,
  );
  expect(handled).toBe(true);
  expect(seen.at(-1)).toEqual({ method: "PATCH", rest: "files/a%2Fb" });
});

test("the specific route declared earlier still wins over the family", async () => {
  const { deps, agentId } = await host();
  const before = seen.length;
  const { handled, res } = await dispatch(
    deps,
    "GET",
    `/agents/${agentId}/activity`,
  );
  expect(handled).toBe(true);
  // The activity route answered from routes/agents-activity.ts; nothing was forwarded.
  expect(seen.length).toBe(before);
  expect(res.status).toBe(503);
});

test("the agent phase runs authorizeAgent once, and relays its refusal", async () => {
  const { deps } = await host();
  const before = seen.length;
  const { handled, res } = await dispatch(
    deps,
    "GET",
    "/agents/nope/providers",
  );
  expect(handled).toBe(true);
  expect(res.status).toBe(404);
  expect(JSON.parse(res.body)).toEqual({ error: "agent not found" });
  expect(seen.length).toBe(before);
});
