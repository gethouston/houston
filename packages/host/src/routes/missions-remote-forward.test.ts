import type { ServerResponse } from "node:http";
import { expect, test } from "vitest";
import { readRemoteMissionStatus } from "./mission-fanout";
import type { RemoteMissionRoute } from "./missions-remote";
import {
  forwardMissionList,
  forwardMissionRead,
  forwardMissionStart,
  forwardMissionStatus,
} from "./missions-remote-forward";

/**
 * The leg out to the target's pod. What matters here is what the CALLER reads:
 * a pod's answer relayed unchanged (so a mission started across the wire is
 * indistinguishable from a local one), a pod's refusal keeping the sentence the
 * model has to act on, and everything that is NOT the pod answering surfacing
 * as a reachability error rather than a plausible-looking success.
 */

const target = {
  remote: true as const,
  id: "slug-1",
  name: "Dobby",
  workspace: "Houston",
  workspaceId: "Houston",
};

function fakeRes() {
  const captured: { status: number; body: unknown } = { status: 0, body: null };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return res;
    },
    end(chunk?: Buffer) {
      captured.body = chunk ? JSON.parse(chunk.toString("utf8")) : null;
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

function route(
  fetchImpl: typeof fetch,
  extra: Partial<RemoteMissionRoute> = {},
): RemoteMissionRoute {
  return {
    target,
    gateway: { url: "https://gw.test", token: "gw-token" },
    fetchImpl,
    ...extra,
  };
}

const answers = (
  status: number,
  body: string,
  seen?: { url: string; init?: RequestInit }[],
) =>
  (async (url: string, init?: RequestInit) => {
    seen?.push({ url: String(url), ...(init ? { init } : {}) });
    return new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;

test("a start is addressed to the target's pod and relayed verbatim", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const { res, captured } = fakeRes();
  const started = await forwardMissionStart(
    route(answers(201, '{"id":"m-9","title":"t","status":"running"}', seen)),
    { title: "t", prompt: "p" },
    { session_key: "conv-parent", agent: "agent-1", depth: 1 },
    res,
  );
  expect(seen[0]?.url).toBe("https://gw.test/agents/slug-1/missions/start");
  const headers = seen[0]?.init?.headers as Record<string, string>;
  expect(headers.Authorization).toBe("Bearer gw-token");
  // The gateway derives the acting user from the authenticated pod credential.
  expect(headers).not.toHaveProperty("x-houston-acting-as");
  expect(captured).toEqual({
    status: 201,
    body: { id: "m-9", title: "t", status: "running" },
  });
  expect(started).toEqual({ status: 201, missionId: "m-9" });
});

test("remote reconciliation reads one mission with acting identity", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const remote = route(answers(200, '{"id":"m-9","status":"running"}', seen), {
    actingAs: "acting-v1.verified",
  });
  expect(await readRemoteMissionStatus(remote, "m-9")).toBe("running");
  expect(seen[0]?.url).toBe(
    "https://gw.test/agents/slug-1/missions/read?id=m-9",
  );
  expect(seen[0]?.init?.headers).toMatchObject({
    Authorization: "Bearer gw-token",
    "x-houston-acting-as": "acting-v1.verified",
  });
  expect(await readRemoteMissionStatus(remote, "missing")).toBe("unknown");
});

test("remote reconciliation recognizes settled statuses and surfaces server failures", async () => {
  for (const status of ["needs_you", "done", "error", "archived"]) {
    const remote = route(answers(200, JSON.stringify({ id: "m-9", status })));
    expect(await readRemoteMissionStatus(remote, "m-9")).toBe("settled");
  }
  await expect(
    readRemoteMissionStatus(route(answers(502, "{}")), "m-9"),
  ).rejects.toThrow("remote board returned 502");
});

test("a read carries the mission id and limit; a list takes neither", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const impl = answers(200, '{"missions":[]}', seen);
  const first = fakeRes();
  await forwardMissionRead(route(impl), { id: "m 9", limit: "5" }, first.res);
  const second = fakeRes();
  await forwardMissionList(route(impl), second.res);
  expect(seen.map((s) => s.url)).toEqual([
    "https://gw.test/agents/slug-1/missions/read?id=m+9&limit=5",
    "https://gw.test/agents/slug-1/missions",
  ]);
});

test("a move is posted to the target's pod and relayed verbatim", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const { res, captured } = fakeRes();
  await forwardMissionStatus(
    route(answers(200, '{"id":"m-9","status":"done"}', seen)),
    { id: "m-9", status: "done" },
    res,
  );
  expect(seen[0]?.url).toBe("https://gw.test/agents/slug-1/missions/status");
  const headers = seen[0]?.init?.headers as Record<string, string>;
  expect(headers).not.toHaveProperty("x-houston-acting-as");
  expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({
    id: "m-9",
    status: "done",
  });
  expect(captured).toEqual({
    status: 200,
    body: { id: "m-9", status: "done" },
  });
});

test("the pod owns the guards, so its refusal to move is what comes back", async () => {
  // Still running, the caller's own conversation, no such mission: all of them
  // are decided on the side that holds the board, in words the model can act on.
  const { res, captured } = fakeRes();
  await forwardMissionStatus(
    route(
      answers(
        409,
        '{"error":"that mission is still running - wait for it to finish before moving it"}',
      ),
    ),
    { id: "m-9", status: "done" },
    res,
  );
  expect(captured.status).toBe(409);
  expect(captured.body).toEqual({
    error:
      "that mission is still running - wait for it to finish before moving it",
    code: "agent_refused",
  });
});

test("the pod's refusal keeps its status and its sentence", async () => {
  const { res, captured } = fakeRes();
  await forwardMissionStart(
    route(
      answers(
        409,
        '{"error":"there are already 20 missions running - wait for some to finish first","code":"mission_cap"}',
      ),
    ),
    { title: "t", prompt: "p" },
    { session_key: "c", agent: "a", depth: 1 },
    res,
  );
  expect(captured.status).toBe(409);
  expect(captured.body).toEqual({
    error:
      "there are already 20 missions running - wait for some to finish first",
    code: "agent_refused",
  });
});

test("anything that is not the pod answering reads as unreachable", async () => {
  const offline = fakeRes();
  await forwardMissionList(
    route((async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch),
    offline.res,
  );
  expect(offline.captured).toEqual({
    status: 502,
    body: {
      error: "could not reach Dobby right now - try again",
      code: "agent_unreachable",
    },
  });

  // A 200 that is not JSON is something else answering (a proxy error page):
  // it must never read as a mission that started.
  const garbled = fakeRes();
  await forwardMissionList(
    route(answers(200, "<html>oops</html>")),
    garbled.res,
  );
  expect(garbled.captured.status).toBe(502);
  expect((garbled.captured.body as { code: string }).code).toBe(
    "agent_unreachable",
  );
});

test("agent-caller forwarding carries acting identity and typed gateway refusals", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const result = fakeRes();
  await forwardMissionStart(
    route(
      answers(
        403,
        '{"code":"agent_not_accepting","error":"gateway text"}',
        seen,
      ),
      {
        actingAs: "acting-v1.verified",
        gateway: { url: "https://gw.test", token: "a".repeat(64) },
      },
    ),
    { title: "t", prompt: "p" },
    { session_key: "c", agent: "caller", depth: 1 },
    result.res,
  );
  expect(seen[0]?.init?.headers).toMatchObject({
    Authorization: `Bearer ${"a".repeat(64)}`,
    "x-houston-acting-as": "acting-v1.verified",
  });
  expect(result.captured.body).toEqual({
    code: "agent_not_accepting",
    error:
      "Dobby isn't taking new missions from other AI Employees right now. You can still read its instructions and missions. The user can turn this on in Dobby's settings under Teamwork, or you can do the work yourself.",
  });
});

test("a typed compute refusal is relayed with its own code", async () => {
  for (const code of ["compute_busy", "pod_wake_refused"]) {
    const { res, captured } = fakeRes();
    await forwardMissionStart(
      route(
        answers(
          503,
          JSON.stringify({
            error: "engine unavailable",
            code,
            retryAfterMs: 3000,
          }),
        ),
      ),
      { title: "t", prompt: "p" },
      { session_key: "c", agent: "a", depth: 1 },
      res,
    );
    expect(captured.status).toBe(503);
    expect(captured.body).toEqual({
      error: "engine unavailable",
      code,
      retryAfterMs: 3000,
    });
  }
});
