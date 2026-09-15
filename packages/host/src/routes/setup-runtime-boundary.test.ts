import { expect, test } from "vitest";
import { createControlPlaneServer } from "../server";
import { close, listen, replayHost } from "../testing/route-replay-host";

/**
 * WHERE THE SETUP SURFACE STOPS. The family claims the whole `/setup-runtime`
 * subtree, not only the ten pairs it forwards, because the two answers it owes
 * a pre-agent client are answers, not routing:
 *
 *  - a sub-path outside the connect allowlist is ITS 404, which is what tells
 *    the onboarding a route is closed here rather than absent from the host;
 *  - a workspace whose runtime has no channel wired is ITS 503, named after
 *    the runtime, and it precedes the allowlist — the dependency is missing
 *    for every sub-path, allowed or not.
 *
 * Probed through the real chain: an unclaimed subtree answers the chain's own
 * 404, which is byte-identical to this family's, so the 503 is the signal that
 * separates "the family answered" from "nothing matched".
 */
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
