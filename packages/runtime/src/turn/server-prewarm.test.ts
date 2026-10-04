import type { Server } from "node:http";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import { AdmissionLimiter } from "./admission";
import { createTurnServer } from "./server";
import type { TurnServerDeps } from "./server-types";
import { ProviderWarmer } from "./turn-provider-warm";

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

class RecordingWarmer extends ProviderWarmer {
  started: { url: string; holdMs: number }[] = [];
  stops = 0;
  override start(url: string, holdMs: number): boolean {
    this.started.push({ url, holdMs });
    return true;
  }
  override stop(): void {
    this.stops += 1;
  }
}

async function serve(extra: Partial<TurnServerDeps> = {}) {
  const warmer = new RecordingWarmer();
  const server = createTurnServer({
    store: new LocalDirStore("/nonexistent-prewarm-store"),
    token: "tok",
    podUid: "e2b-sandbox",
    providerWarmer: warmer,
    ...extra,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return { base: `http://127.0.0.1:${address.port}`, warmer };
}

const headers = {
  "content-type": "application/json",
  "x-internal-token": "tok",
  "x-pool-pod-uid": "e2b-sandbox",
};

const prewarm = (
  base: string,
  body: unknown,
  extra: Record<string, string> = headers,
) =>
  fetch(`${base}/prewarm`, {
    method: "POST",
    headers: extra,
    body: JSON.stringify(body),
  });

test("a prewarm opens the named provider's connection and answers 202", async () => {
  const { base, warmer } = await serve();
  const res = await prewarm(base, {
    provider: "openai-codex",
    model: "gpt-5.5",
    holdMs: 180_000,
  });
  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({ warming: true });
  expect(warmer.started).toHaveLength(1);
  expect(new URL(warmer.started[0]?.url ?? "").origin).toBe(
    "https://chatgpt.com",
  );
  expect(warmer.started[0]?.holdMs).toBe(180_000);
});

test("a provider this process cannot warm answers 202 without warming", async () => {
  const { base, warmer } = await serve();
  const res = await prewarm(base, { provider: "anthropic", holdMs: 1_000 });
  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({ warming: false });
  expect(warmer.started).toHaveLength(0);
});

test("a prewarm passes the turn's own gates", async () => {
  // A single-use worker, as in a sandbox: a missing incarnation is refused.
  const { base, warmer } = await serve({
    singleUse: { begin: async () => {}, settled: () => {} },
  });
  const body = { provider: "openrouter", holdMs: 1_000 };
  expect(
    (await prewarm(base, body, { ...headers, "x-internal-token": "nope" }))
      .status,
  ).toBe(401);
  expect(
    (await prewarm(base, body, { ...headers, "x-pool-pod-uid": "other" }))
      .status,
  ).toBe(409);
  const { "x-pool-pod-uid": _uid, ...noUid } = headers;
  expect((await prewarm(base, body, noUid)).status).toBe(409);
  expect(warmer.started).toHaveLength(0);
});

test("a spent worker refuses a prewarm", async () => {
  const { base, warmer } = await serve({ isDraining: () => true });
  const res = await prewarm(base, { provider: "openrouter", holdMs: 1_000 });
  expect(res.status).toBe(503);
  expect(warmer.started).toHaveLength(0);
});

test("a malformed prewarm answers 400 and warms nothing", async () => {
  const { base, warmer } = await serve();
  for (const body of [
    {},
    { provider: "", holdMs: 1 },
    { provider: "openrouter" },
    { provider: "openrouter", holdMs: -1 },
    { provider: "openrouter", holdMs: 1, model: 7 },
  ]) {
    expect((await prewarm(base, body)).status).toBe(400);
  }
  expect(warmer.started).toHaveLength(0);
});

test("a prewarm takes no admission slot, so it never blocks the turn", async () => {
  const admission = new AdmissionLimiter(1);
  const hold = admission.tryAcquire();
  expect(hold).toBeTruthy();
  const { base, warmer } = await serve({ admission });
  const res = await prewarm(base, { provider: "openrouter", holdMs: 1_000 });
  expect(res.status).toBe(202);
  expect(warmer.started).toHaveLength(1);
  hold?.();
});

test("a turn's arrival stops the warm before anything else", async () => {
  const { base, warmer } = await serve();
  await fetch(`${base}/turn`, {
    method: "POST",
    headers,
    body: "{not json",
  });
  expect(warmer.stops).toBe(1);
});
