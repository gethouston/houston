import type { ServerResponse } from "node:http";
import { expect, test, vi } from "vitest";
import type { AgentId, UserId, Workspace } from "../domain/types";
import type { WorkspaceStore } from "../ports";
import {
  ASSISTANT_AGENT_NAME,
  ASSISTANT_CONVERSATION_ID,
  ASSISTANT_PATH,
  type AssistantDeps,
  handleAssistant,
} from "./assistant";

/**
 * Personal-assistant discovery. What these pin: the answer is an ADDRESS on the
 * existing per-agent surface (no new chat wire), the hidden agent is created on
 * the first ask and the second ask changes nothing, and a gateway-fronted pod
 * refuses rather than inventing a second discovery.
 */

const WORKSPACE: Workspace = {
  id: "Personal",
  ownerUserId: "local-owner",
  kind: "personal",
  name: "Personal",
  slug: "Personal",
  runtime: "local",
  createdAt: 0,
};

const USER: UserId = "local-owner";

function mockRes() {
  const out: { status?: number; body?: unknown } = {};
  const res = {
    writeHead(status: number) {
      out.status = status;
    },
    end(buf?: Buffer | string) {
      const text = buf?.toString() ?? "";
      out.body = text ? JSON.parse(text) : undefined;
    },
  } as unknown as ServerResponse;
  return { res, out };
}

function deps(overrides: Partial<AssistantDeps> = {}): AssistantDeps {
  const store = {
    getOrCreatePersonalWorkspace: vi.fn(async () => WORKSPACE),
  } as unknown as WorkspaceStore;
  return {
    store,
    ensureSyntheticAgentDir: vi.fn(),
    ...overrides,
  };
}

async function get(d: AssistantDeps, method = "GET") {
  const { res, out } = mockRes();
  const handled = await handleAssistant(d, USER, method, ASSISTANT_PATH, res);
  expect(handled).toBe(true);
  return out;
}

test("discovery names the hidden agent and the conversation to open", async () => {
  const d = deps();
  const res = await get(d);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    agent: `Personal/${ASSISTANT_AGENT_NAME}`,
    conversation: ASSISTANT_CONVERSATION_ID,
  });
  // A dot-named agent: list-hidden by construction, and no user action can
  // create or rename onto it.
  expect(ASSISTANT_AGENT_NAME.startsWith(".")).toBe(true);
  expect(d.ensureSyntheticAgentDir).toHaveBeenCalledWith(
    `Personal/${ASSISTANT_AGENT_NAME}` satisfies AgentId,
  );
});

test("a second call is idempotent — same address, no second agent", async () => {
  const d = deps();
  const first = await get(d);
  const second = await get(d);
  expect(second.status).toBe(200);
  expect(second.body).toEqual(first.body);
  // The create is a mkdir -p, so asking again converges instead of failing.
  expect(d.ensureSyntheticAgentDir).toHaveBeenCalledTimes(2);
});

test("a gateway-fronted pod refuses: the gateway owns discovery there", async () => {
  const res = await get(deps({ gatewayFronted: true }));
  expect(res.status).toBe(501);
  expect(res.body).toMatchObject({ code: "assistant_gateway_only" });
});

test("a host with no agent tree says so instead of handing out a dead address", async () => {
  const res = await get(deps({ ensureSyntheticAgentDir: undefined }));
  // 501, not 503: a host with no agent tree will NEVER grow one mid-session, so
  // this is "not implemented here", the same answer the gateway-fronted branch
  // gives. As a 503 it was retried eight times over ten seconds by the desktop
  // transport before the client's classifier ever saw it.
  expect(res.status).toBe(501);
  expect(res.body).toMatchObject({ code: "assistant_unavailable" });
});

test("only GET discovers", async () => {
  expect((await get(deps(), "POST")).status).toBe(405);
});

test("another path falls through to the rest of the router", async () => {
  expect(
    await handleAssistant(deps(), USER, "GET", "/v1/agents", mockRes().res),
  ).toBe(false);
});
