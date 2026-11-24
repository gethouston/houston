import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, test } from "vitest";
import { ACTING_AS_HEADER } from "../auth/acting";
import {
  ASSISTANT_CALL_HEADER,
  assistantCallHeaders,
} from "../auth/assistant-call";
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

async function forward(
  request: AssistantUpstreamRequest,
  through: AssistantGateway = gateway,
) {
  const attempts: Attempt[] = [];
  const { res, captured } = fakeRes();
  await forwardAssistantCall(
    through,
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

test("an upstream name-taken refusal reaches the manager with its status and sentence", async () => {
  const upstreamBody = JSON.stringify({
    error: 'an agent named "Mia" already exists in this workspace',
    code: "name_taken",
  });
  const { res, captured } = fakeRes();
  await forwardAssistantCall(
    gateway,
    { method: "POST", path: "/agents", query: {}, body: { name: "mia" } },
    {
      operation: "createAgent",
      actingAs: undefined,
      fetchImpl: (async () =>
        new Response(upstreamBody, { status: 409 })) as unknown as typeof fetch,
    },
    res,
  );

  expect(captured.status).toBe(409);
  expect(JSON.parse(captured.body)).toEqual({
    error: upstreamBody,
    code: "gateway_error",
  });
});

describe("the manager proof (PRODUCT-1928)", () => {
  const request: AssistantUpstreamRequest = {
    method: "POST",
    path: "/agents/A/activities",
    query: {},
    body: { title: "t" },
  };

  test("a loopback call to this host carries it", async () => {
    const { attempts } = await forward(request, {
      url: "http://127.0.0.1:4318",
      token: "boot",
      loopback: true,
    });
    expect(attempts[0]?.headers[ASSISTANT_CALL_HEADER]).toBe(
      assistantCallHeaders()[ASSISTANT_CALL_HEADER],
    );
  });

  test("a configured gateway never receives it", async () => {
    const { attempts } = await forward(request);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.headers).not.toHaveProperty(ASSISTANT_CALL_HEADER);
  });

  test("a loopback call never follows a redirect off the host", async () => {
    const reached: IncomingHttpHeaders[] = [];
    const elsewhere = await listen((req, res) => {
      reached.push(req.headers);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
    const self = await listen((_req, res) => {
      res.writeHead(302, { Location: `${elsewhere.url}/stolen` });
      res.end();
    });
    try {
      const { res, captured } = fakeRes();
      await forwardAssistantCall(
        { url: self.url, token: "boot", loopback: true },
        request,
        { operation: "createActivity", actingAs: undefined, fetchImpl: fetch },
        res,
      );
      expect(reached).toEqual([]);
      expect(captured.status).toBe(502);
      expect(captured.body).toContain("gateway_error");
    } finally {
      await Promise.all([self.close(), elsewhere.close()]);
    }
  });
});

/** A real HTTP server on an ephemeral loopback port. */
async function listen(
  handler: Parameters<typeof createServer>[1] & {},
): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

describe("a typed compute refusal keeps its code", () => {
  test("compute_busy and pod_wake_refused reach the caller as themselves", async () => {
    for (const code of ["compute_busy", "pod_wake_refused"]) {
      const { res, captured } = fakeRes();
      const outcome = await forwardAssistantCall(
        gateway,
        { method: "POST", path: "/agents/A/missions", query: {} },
        {
          operation: "startMission",
          actingAs: "user-1",
          fetchImpl: (async () =>
            new Response(
              JSON.stringify({ error: "engine unavailable", code }),
              { status: 503 },
            )) as unknown as typeof fetch,
        },
        res,
      );
      expect(outcome).toBe("refused");
      expect(captured.status).toBe(503);
      expect(JSON.parse(captured.body)).toEqual({
        error: "engine unavailable",
        code,
      });
    }
  });
});
