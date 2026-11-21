import { expect, test } from "vitest";
import { createControlPlaneServer } from "../server";
import { close, listen, replayHost } from "../testing/route-replay-host";

async function probe(
  token: string,
): Promise<{ status: number; error: string | null }> {
  const host = await replayHost();
  const server = createControlPlaneServer(host.deps);
  const base = await listen(server);
  try {
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
