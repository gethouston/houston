import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, expect, test, vi } from "vitest";
import type { CredentialVault } from "../ports";
import { refuseOutOfCoordinatorScope } from "./sandbox-scope";

/**
 * S3: a valid sandbox token is every runtime's key to `/sandbox/*`, and the
 * coordinator's runtime holds one. The table below is EVERY sandbox family this
 * host mounts (server.ts), so a new one added without a decision here shows up
 * as a missing row rather than as silent reach.
 */

const ASSISTANT = "ws/.assistant";
const ORDINARY = "ws/Dobby";

const vault: CredentialVault = {
  sandboxToken: () => "token",
  validateSandboxToken: (agentId) => ({ workspaceId: "ws", agentId }),
};

function callWith(
  agentId: string,
  path: string,
  gatewayFronted = false,
): { refused: boolean; status: number; body: unknown } {
  const captured = { status: 0, body: null as unknown };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return res;
    },
    end(chunk?: Buffer) {
      captured.body = chunk ? JSON.parse(chunk.toString("utf8")) : null;
    },
  } as unknown as ServerResponse;
  const req = {
    headers: { authorization: `Bearer ${agentId}` },
  } as unknown as IncomingMessage;
  const refused = refuseOutOfCoordinatorScope(
    { vault, gatewayFronted },
    path,
    new URL(`http://host.invalid${path}`),
    req,
    res,
  );
  return { refused, status: captured.status, body: captured.body };
}

afterEach(() => vi.unstubAllEnvs());

/** Every `/sandbox/*` path server.ts mounts, and whether the assistant reaches it. */
const ROUTES: readonly [path: string, allowed: boolean][] = [
  ["/sandbox/assistant/call", true],
  ["/sandbox/assistant/pending", true],
  ["/sandbox/missions", true],
  ["/sandbox/missions/read", true],
  ["/sandbox/missions/start", true],
  ["/sandbox/missions/status", true],
  ["/sandbox/missions/settle", true],
  ["/sandbox/learnings/save", true],
  ["/sandbox/transcripts/conversations/c1", true],
  ["/sandbox/transcripts/conversations/c1/messages", true],
  ["/sandbox/credential", true],
  ["/sandbox/credential/revoked", true],
  ["/sandbox/provider-usage", true],
  ["/sandbox/skills/search", false],
  ["/sandbox/skills/install", false],
  ["/sandbox/routines/save", false],
  ["/sandbox/integrations/search", false],
  ["/sandbox/integrations/execute", false],
  ["/sandbox/integrations/custom/detect", false],
  ["/sandbox/integrations/custom/add", false],
  ["/sandbox/integrations/custom/remove", false],
  ["/sandbox/integrations/custom/status", false],
];

test.each(ROUTES)("the coordinator and %s: allowed=%s", (path, allowed) => {
  const result = callWith(ASSISTANT, path);
  expect(result.refused).toBe(!allowed);
  if (!allowed) {
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ code: "coordinator_scope" });
  }
});

test.each(ROUTES)("an ordinary agent keeps %s (allowed=%s)", (path) => {
  expect(callWith(ORDINARY, path).refused).toBe(false);
});

test("an assistant pod's single agent is held to the same scope", () => {
  // On a managed pod the coordinator is an ordinarily-named agent, so the
  // identity comes from the gateway-stamped assistant user id, not the name.
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "owner");
  expect(callWith("ws/Assistant", "/sandbox/skills/install", true).status).toBe(
    403,
  );
  expect(
    callWith("ws/Assistant", "/sandbox/missions/start", true).refused,
  ).toBe(false);
});

test("an ordinary agent's pod is not the assistant, whatever it is named", () => {
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "");
  expect(
    callWith("ws/Assistant", "/sandbox/skills/install", true).refused,
  ).toBe(false);
});

test("paths outside /sandbox and calls with no token are left to their routes", () => {
  expect(callWith(ASSISTANT, "/agents/ws%2FDobby/activities").refused).toBe(
    false,
  );
  const res = {
    writeHead: () => res,
    end: () => {},
  } as unknown as ServerResponse;
  expect(
    refuseOutOfCoordinatorScope(
      { vault },
      "/sandbox/skills/install",
      new URL("http://host.invalid/sandbox/skills/install"),
      { headers: {} } as unknown as IncomingMessage,
      res,
    ),
  ).toBe(false);
});
