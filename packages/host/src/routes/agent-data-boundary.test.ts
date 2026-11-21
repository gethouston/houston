import { expect, test } from "vitest";
import { createControlPlaneServer } from "../server";
import { close, listen, replayHost } from "../testing/route-replay-host";

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

test("an item path on an item-less family is the family's 405", async () => {
  for (const method of ["GET", "PUT"]) {
    for (const rest of ["config/x", "learnings/x"]) {
      const answer = await probe(method, rest);
      expect(answer).toEqual({
        status: 405,
        error: "method not allowed",
        forwarded: [],
      });
    }
  }
});

test("every method on a routine run item is the family's 405", async () => {
  for (const method of ["GET", "POST", "DELETE"]) {
    const answer = await probe(method, "routine_runs/run-1");
    expect(answer).toEqual({
      status: 405,
      error: "method not allowed",
      forwarded: [],
    });
  }
});

test("a path deeper than one item reaches the agent's engine", async () => {
  const answer = await probe("GET", "config/x/y");
  expect(answer.status).toBe(200);
  expect(answer.forwarded).toEqual(["GET /config/x/y"]);
});
