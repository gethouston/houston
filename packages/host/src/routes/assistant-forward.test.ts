import type { ServerResponse } from "node:http";
import { describe, expect, test } from "vitest";
import { ACTING_AS_HEADER } from "../auth/acting";
import type { AssistantUpstreamRequest } from "./assistant-dispatch";
import {
  type AssistantGateway,
  forwardAssistantCall,
} from "./assistant-forward";

/**
 * The gateway leg. `upstreamUrl` is where a built path becomes a real address,
 * so it is the last place a path that does not address its own route can be
 * stopped before the gateway credential performs it. `buildPath` refuses those
 * values first; this guard is independent of it on purpose, because the two
 * are reachable apart (the parity probes and any future caller build requests
 * without going through the dispatcher).
 */

const gateway: AssistantGateway = {
  url: "https://gateway.test",
  token: "gateway-secret",
};

/** A fake ServerResponse capturing the status + body the forwarder writes. */
function fakeRes() {
  const captured: { status: number; body: string } = { status: 0, body: "" };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return res;
    },
    end(chunk?: Buffer | string) {
      captured.body = chunk ? chunk.toString() : "";
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

interface Attempt {
  url: string;
  headers: Record<string, string>;
}

/** A fetch that records every call and answers an empty 200. */
function recordingFetch(attempts: Attempt[]): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    attempts.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

async function forward(request: AssistantUpstreamRequest) {
  const attempts: Attempt[] = [];
  const { res, captured } = fakeRes();
  await forwardAssistantCall(
    gateway,
    request,
    {
      operation: "readAgentFile",
      actingAs: "user-1",
      fetchImpl: recordingFetch(attempts),
    },
    res,
  );
  return { attempts, captured };
}

describe("a request whose address does not survive URL parsing is refused", () => {
  test("a traversing path never reaches the gateway", async () => {
    const { attempts, captured } = await forward({
      method: "GET",
      path: "/agents/A/agentfile/../../../v1/preferences/private-key",
      query: {},
    });
    expect(attempts).toEqual([]);
    expect(captured.status).toBe(400);
    expect(captured.body).toContain("gateway_address");
  });

  test("a percent-encoded traversal is refused too", async () => {
    const { attempts, captured } = await forward({
      method: "GET",
      path: "/agents/A/agentfile/%2e%2e/%2e%2e/v1/preferences/private-key",
      query: {},
    });
    expect(attempts).toEqual([]);
    expect(captured.status).toBe(400);
  });

  test("an ordinary path is forwarded verbatim, query and identity intact", async () => {
    const { attempts, captured } = await forward({
      method: "GET",
      path: "/agents/Work%2FSales/agentfile/board/activity%20one.json",
      query: { limit: "5" },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.url).toBe(
      "https://gateway.test/agents/Work%2FSales/agentfile/board/activity%20one.json?limit=5",
    );
    expect(attempts[0]?.headers[ACTING_AS_HEADER]).toBe("user-1");
    expect(captured.status).toBe(200);
  });
});
