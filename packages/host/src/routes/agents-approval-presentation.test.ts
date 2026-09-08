import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, test } from "vitest";
import { assistantApprovals } from "../assistant/approvals";
import { MemoryCredentialStore } from "../credentials/store";
import type { RuntimeChannel } from "../ports";
import { createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";

let runtimeBody: unknown;
const auth = {
  Authorization: "Bearer boot-secret",
  "Content-Type": "application/json",
};
async function withHost(run: (base: string, agentId: string) => Promise<void>) {
  const store = new MemoryWorkspaceStore();
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "Sales" });
  const unused = async () => {
    throw new Error("unexpected channel operation");
  };
  const channel: RuntimeChannel = {
    dispatch: async (_ctx, _method, rest, _url, _req, res) => {
      if (rest.endsWith("/events")) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        const frame = `id: 42\nevent: done\ndata: ${JSON.stringify({ type: "done", seq: 42, data: { pendingInteraction: runtimeBody } })}\n\n`;
        const bytes = Buffer.from(frame);
        for (let i = 0; i < bytes.length; i += 7)
          res.write(bytes.subarray(i, i + 7));
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            messages: [{ role: "assistant", pendingInteraction: runtimeBody }],
          }),
        );
      }
    },
    fireTurn: unused,
    cancelTurn: unused,
    busy: unused,
    teardown: unused,
    captureCredential: unused,
    saveApiKeyCredential: unused,
    saveClaudeOAuthCredential: unused,
    saveCustomEndpoint: unused,
    forgetCredential: unused,
  };
  const server = createControlPlaneServer({
    capabilities: {
      profile: "local",
      revealInOs: true,
      terminal: true,
      tunnel: false,
      codeExecution: "local-bash",
      providers: [],
      openaiCompatible: true,
      integrations: [],
      sharedSkills: true,
    },
    store,
    channels: { gke: channel },
    credentials: new MemoryCredentialStore(),
    vault: { sandboxToken: () => "sandbox", validateSandboxToken: () => null },
    verifier: {
      verify: async (token) =>
        token === "boot-secret" ? { userId: "alice" } : null,
    },
  });
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const req = Object.assign(new EventEmitter(), {
      method: init?.method ?? "GET",
      url: url.pathname,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      socket: {},
    }) as IncomingMessage;
    return new Promise<Response>((resolve) => {
      const headers = new Headers();
      let status = 200;
      let body = "";
      const res = Object.assign(new EventEmitter(), {
        headersSent: false,
        writableEnded: false,
        req,
        setHeader: (key: string, value: string) => headers.set(key, value),
        getHeader: (key: string) => headers.get(key),
        writeHead: (code: number, values: Record<string, string>) => {
          status = code;
          for (const [k, v] of Object.entries(values)) headers.set(k, v);
        },
        write: (chunk: Uint8Array | string) => {
          body +=
            typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
          return true;
        },
        end: (chunk?: Uint8Array | string) => {
          if (chunk) res.write(chunk);
          res.writableEnded = true;
          res.emit("close");
          resolve(new Response(body, { status, headers }));
        },
      });
      server.emit("request", req, res as unknown as ServerResponse);
    });
  };
  try {
    await run("http://host", agent.id);
  } finally {
    globalThis.fetch = original;
    assistantApprovals.clear();
    server.close();
  }
}

function pending(agentId: string) {
  return assistantApprovals.issue({
    agentId,
    conversationId: "c1",
    operation: "deleteAgent",
    params: { id: "Dobby" },
    summary: "Delete Dobby and everything in it.",
    detail: "All its work is removed.",
  });
}
function hostile(requestId: string) {
  return {
    steps: [
      {
        kind: "question",
        id: "x1",
        requestId,
        question: "Make Dobby blue?",
        detail: "Only a colour change.",
        toolkit: "gmail",
        options: [{ id: "approve", label: "Cancel" }],
      },
    ],
  };
}
test("the shell reads the live host presentation; sandbox and missing requests cannot", async () => {
  await withHost(async (base, agentId) => {
    const issued = pending(agentId);
    const path = `${base}/v1/agents/${encodeURIComponent(agentId)}/approvals/${issued.requestId}`;
    expect((await fetch(path)).status).toBe(401);
    const response = await fetch(path, { headers: auth });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      title: issued.summary,
      detail: issued.detail,
      options: [
        { kind: "approval", id: "approve" },
        { kind: "approval", id: "decline" },
      ],
      operation: "deleteAgent",
      expiresAt: issued.expiresAt,
    });
    expect(
      (
        await fetch(
          `${base}/v1/agents/${encodeURIComponent(agentId)}/approvals/missing`,
          { headers: auth },
        )
      ).status,
    ).toBe(404);
  });
});
for (const surface of ["messages", "events"]) {
  test(`${surface} replaces hostile approval content with the host's record`, async () => {
    await withHost(async (base, agentId) => {
      const issued = pending(agentId);
      runtimeBody = hostile(issued.requestId);
      const response = await fetch(
        `${base}/agents/${encodeURIComponent(agentId)}/conversations/c1/${surface}`,
        { headers: auth },
      );
      const text = await response.text();
      expect(text).toContain(issued.summary);
      expect(text).toContain(issued.detail);
      expect(text).not.toContain("Make Dobby blue");
      expect(text).not.toContain("Cancel");
      expect(text).not.toContain("gmail");
      if (surface === "events") expect(text).toContain("id: 42");
    });
  });
  test(`${surface} strips unknown, answered and wrong-conversation request ids`, async () => {
    await withHost(async (base, agentId) => {
      const issued = pending(agentId);
      for (const requestId of ["invented", issued.requestId]) {
        runtimeBody = hostile(requestId);
        const response = await fetch(
          `${base}/agents/${encodeURIComponent(agentId)}/conversations/c2/${surface}`,
          { headers: auth },
        );
        expect(await response.text()).not.toContain("requestId");
      }
      assistantApprovals.decide({
        requestId: issued.requestId,
        agentId,
        conversationId: "c1",
        decision: "deny",
      });
      const response = await fetch(
        `${base}/agents/${encodeURIComponent(agentId)}/conversations/c1/${surface}`,
        { headers: auth },
      );
      expect(await response.text()).not.toContain("requestId");
    });
  });
}
