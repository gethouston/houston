import type { Server } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { RuntimeChannel, TokenVerifier } from "../ports";
import { workspaceRoot } from "../routes/agent-data";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";

/**
 * The anonymize route's AI pass: the host regex-pre-redacts the selected
 * content, sends it through the channel to the agent's runtime, and merges
 * the model's redactions back; a failing (or unsupported) AI pass falls back
 * to the regex-only result WITH the reason on the wire.
 */

const verifier: TokenVerifier = {
  async verify(b) {
    return b.startsWith("tok:") ? { userId: b.slice(4) } : null;
  },
};

/** A channel whose only useful behavior is the anonymize one-shot. */
function fakeChannel(
  anonymizeTexts?: RuntimeChannel["anonymizeTexts"],
): RuntimeChannel {
  const unused = () => Promise.reject(new Error("not under test"));
  return {
    dispatch: unused,
    fireTurn: unused,
    cancelTurn: unused,
    busy: async () => false,
    teardown: async () => {},
    captureCredential: unused,
    saveApiKeyCredential: unused,
    saveClaudeOAuthCredential: unused,
    saveCustomEndpoint: unused,
    forgetCredential: unused,
    ...(anonymizeTexts ? { anonymizeTexts } : {}),
  };
}

const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: [],
};

const store = new MemoryWorkspaceStore();
const vfs = new MemoryVfs();
const seen: { id: string; text: string }[][] = [];
let channelImpl: RuntimeChannel = fakeChannel();

const deps: ControlPlaneDeps = {
  verifier,
  store,
  credentials: new MemoryCredentialStore(),
  vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
  channels: {
    get gke() {
      return channelImpl;
    },
  },
  vfs,
  capabilities: CAPS,
};

let server: Server;
let base = "";
let agentId = "";
const auth = {
  Authorization: "Bearer tok:alice",
  "Content-Type": "application/json",
};

beforeAll(async () => {
  server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  agentId = (
    (await (
      await fetch(`${base}/agents`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ name: "Priv" }),
      })
    ).json()) as { id: string }
  ).id;
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("Expected alice's agent to exist");
  await vfs.writeText(
    `${workspaceRoot(ws, agent)}/CLAUDE.md`,
    "You assist Julian (julian@acme.com) at Acme Corp.",
  );
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const anonymize = async () =>
  (await (
    await fetch(`${base}/agents/${agentId}/portable/anonymize`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        claudeMd: true,
        skillSlugs: [],
        routineIds: [],
        learningIds: [],
      }),
    })
  ).json()) as {
    claudeMd: { before: string; after: string; summary: string } | null;
    mode: "ai" | "patterns";
    aiError?: string;
  };

test("AI pass merges the runtime's redactions (mode: ai)", async () => {
  channelImpl = fakeChannel(async (_ctx, items) => {
    seen.push(items);
    return items.map((i) => ({
      id: i.id,
      text: i.text
        .replace("Julian", "<name>")
        .replace("Acme Corp", "<company>"),
      summary: "redacted a name and a company",
    }));
  });

  const out = await anonymize();
  expect(out.mode).toBe("ai");
  expect(out.aiError).toBeUndefined();
  expect(out.claudeMd?.after).toBe("You assist <name> (<email>) at <company>.");
  expect(out.claudeMd?.summary).toBe(
    "redacted 1 email; redacted a name and a company",
  );
  // The runtime only ever saw the regex-pre-redacted text — never the email.
  expect(seen[0]?.[0]?.text).toContain("<email>");
  expect(seen[0]?.[0]?.text).not.toContain("julian@acme.com");
});

test("a failing AI pass falls back to patterns WITH the reason", async () => {
  channelImpl = fakeChannel(async () => {
    throw new Error("No provider connected");
  });

  const out = await anonymize();
  expect(out.mode).toBe("patterns");
  expect(out.aiError).toBe("No provider connected");
  // The regex redaction still shipped.
  expect(out.claudeMd?.after).toBe("You assist Julian (<email>) at Acme Corp.");
});

test("a channel without the one-shot falls back to patterns", async () => {
  channelImpl = fakeChannel();
  const out = await anonymize();
  expect(out.mode).toBe("patterns");
  expect(out.aiError).toContain("not available");
});
