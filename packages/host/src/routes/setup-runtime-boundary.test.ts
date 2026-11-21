import { expect, test } from "vitest";
import { createControlPlaneServer } from "../server";
import { close, listen, replayHost } from "../testing/route-replay-host";

async function probe(
  rest: string,
  opts: { channels?: Record<string, never> } = {},
): Promise<{ status: number; error: string | null; forwarded: string[] }> {
  const host = await replayHost();
  const server = createControlPlaneServer({
    ...host.deps,
    ...(opts.channels ? { channels: opts.channels } : {}),
  });
  const base = await listen(server);
  try {
    const response = await fetch(`${base}/setup-runtime/${rest}`, {
      method: "GET",
      headers: { Authorization: "Bearer tok:alice" },
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

test("a sub-path outside the connect allowlist is the family's 404", async () => {
  const answer = await probe("bogus");
  expect(answer).toEqual({ status: 404, error: "not found", forwarded: [] });
});

test("an unwired runtime answers 503 for any sub-path of the subtree", async () => {
  for (const rest of ["providers", "bogus"]) {
    const answer = await probe(rest, { channels: {} });
    expect(answer).toEqual({
      status: 503,
      error: "gke runtime not configured",
      forwarded: [],
    });
  }
});
