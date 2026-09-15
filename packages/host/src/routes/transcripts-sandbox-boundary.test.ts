import { expect, test } from "vitest";
import { createControlPlaneServer } from "../server";
import { close, listen, replayHost } from "../testing/route-replay-host";

/**
 * WHERE THE SHADOW FAMILY STOPS. It claims the conversation prefix for every
 * method, INCLUDING a conversation id that does not decode: the caller is a
 * runtime holding a valid sandbox token, and declining would hand it the 401
 * wall — a signal that says "your token is wrong" about a request whose token
 * is right. The family answers its own refusal instead, and the token check
 * still runs first for a caller who has no business here.
 */
async function probe(
  token: string,
): Promise<{ status: number; error: string | null }> {
  const host = await replayHost();
  const server = createControlPlaneServer(host.deps);
  const base = await listen(server);
  try {
    // A percent escape decodeURIComponent throws on: the matcher refuses to
    // decode it, so only the family's prefix claim can reach the handler.
    const response = await fetch(
      `${base}/sandbox/transcripts/conversations/%E0%A4%A`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
    const body = (await response.json()) as { error?: unknown };
    return {
      status: response.status,
      error: typeof body.error === "string" ? body.error : null,
    };
  } finally {
    await close(server);
  }
}

test("an undecodable conversation id is answered by the shadow family", async () => {
  // The shadow is unwired on this host, so its 503 is the answer — what
  // matters is that it comes from the handler and not from the auth wall.
  expect(await probe("sbx")).toEqual({
    status: 503,
    error: "transcript shadow not configured",
  });
});

test("a caller without a sandbox token still meets the 401 wall", async () => {
  expect(await probe("not-a-sandbox-token")).toEqual({
    status: 401,
    error: "unauthorized",
  });
});
