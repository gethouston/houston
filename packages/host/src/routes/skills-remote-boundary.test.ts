import { expect, test } from "vitest";
import { createControlPlaneServer } from "../server";
import { close, listen, replayHost } from "../testing/route-replay-host";

/**
 * WHERE THE MARKETPLACE FAMILY STOPS. Its regex claims `skills/{community,repo}/
 * <lower-case action>`, which is WIDER than the six pairs it serves, and the
 * difference is behaviour a route list alone cannot state:
 *
 *  - a lower-case action nobody serves is the family's own 404;
 *  - a wrong method on a real action is the family's blanket 405;
 *  - anything the regex never matched belongs to the agent's engine, so the
 *    family declines and the request is forwarded.
 *
 * Probed through the real chain, so `forwarded` is what separates "the family
 * answered" from "it let go" — the same signal the golden replay records.
 */
async function probe(
  method: string,
  rest: string,
): Promise<{ status: number; error: string | null; forwarded: string[] }> {
  const host = await replayHost();
  const server = createControlPlaneServer(host.deps);
  const base = await listen(server);
  try {
    const response = await fetch(`${base}/agents/${host.ids.agentId}/${rest}`, {
      method,
      headers: {
        Authorization: "Bearer tok:alice",
        ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
      },
      ...(method === "GET" ? {} : { body: "{}" }),
    });
    const body = (await response.json()) as { error?: unknown };
    return {
      status: response.status,
      error: typeof body.error === "string" ? body.error : null,
      forwarded: host.forwarded,
    };
  } finally {
    await close(server);
  }
}

test("an unknown lower-case action is the family's 404, never the engine's", async () => {
  for (const rest of ["skills/community/bogus", "skills/repo/bogus"]) {
    const answer = await probe("POST", rest);
    expect(answer).toEqual({ status: 404, error: "not found", forwarded: [] });
  }
});

test("a wrong method on a served action is the family's blanket 405", async () => {
  const answer = await probe("GET", "skills/community/search");
  expect(answer).toEqual({
    status: 405,
    error: "method not allowed",
    forwarded: [],
  });
});

test("an action the regex never matched reaches the agent's engine", async () => {
  // Upper case, and a percent-escaped slug: both fall outside `[a-z]+`, so the
  // family declines and the chain walks on to the proxy.
  for (const rest of ["skills/community/Search", "skills/community/%73earch"]) {
    const answer = await probe("POST", rest);
    expect(answer.status).toBe(200);
    expect(answer.forwarded).toEqual([`POST /${rest}`]);
  }
});
