import { expect, test } from "vitest";
import { retryComputeBusyOnce } from "./compute-busy-retry";
import { missionCall } from "./mission-call";
import type { SandboxFetch } from "./sandbox-fetch";

const busy = () =>
  Response.json(
    { error: "engine unavailable", code: "compute_busy", retryAfterMs: 0 },
    { status: 503 },
  );

test("a compute_busy answer is sent once more, then relayed", async () => {
  const answers = [busy(), Response.json({ ok: true })];
  let sent = 0;
  const res = await retryComputeBusyOnce(async () => {
    sent++;
    return answers.shift() as Response;
  }, undefined);
  expect(sent).toBe(2);
  expect(await res.json()).toEqual({ ok: true });
});

test("a second compute_busy is returned as is, never a third send", async () => {
  let sent = 0;
  const res = await retryComputeBusyOnce(async () => {
    sent++;
    return busy();
  }, undefined);
  expect(sent).toBe(2);
  expect(res.status).toBe(503);
});

test("pod_wake_refused and plain 503s are never sent again", async () => {
  for (const body of [
    { error: "engine unavailable", code: "pod_wake_refused" },
    { error: "engine unavailable" },
  ]) {
    let sent = 0;
    await retryComputeBusyOnce(async () => {
      sent++;
      return Response.json(body, { status: 503 });
    }, undefined);
    expect(sent).toBe(1);
  }
});

test("an aborted turn stops the pause instead of sending again", async () => {
  const abort = new AbortController();
  abort.abort();
  let sent = 0;
  await expect(
    retryComputeBusyOnce(async () => {
      sent++;
      return Response.json(
        { error: "engine unavailable", code: "compute_busy" },
        { status: 503 },
      );
    }, abort.signal),
  ).rejects.toThrow();
  expect(sent).toBe(1);
});

test("the mission tools name a refusal that outlived its retry", async () => {
  const call = (answer: () => Response) =>
    missionCall((async () => answer()) as unknown as SandboxFetch)(
      "POST",
      "/start",
      {},
      undefined,
    );
  expect(await call(busy)).toMatchObject({
    ok: false,
    error: { code: "compute_busy", status: 503 },
  });
  expect(
    await call(() =>
      Response.json(
        { error: "engine unavailable", code: "pod_wake_refused" },
        { status: 503 },
      ),
    ),
  ).toMatchObject({
    ok: false,
    error: { code: "operation_unavailable_here", status: 503 },
  });
});
