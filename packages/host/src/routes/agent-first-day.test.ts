import type { FirstDayStartResult } from "@houston/protocol";
import { AUTO_CONTINUE_MARKER } from "@houston/protocol";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  bootFirstDayHost,
  type FirstDayHost,
  PENDING,
} from "../testing/first-day-harness";

/**
 * `POST /agents/:agentId/first-day` — the ONE way an AI Employee's first day
 * starts, for every surface and the AI Manager. The findings it closes:
 *
 * - C7 / codex 14: two starts (two tabs, two buttons) make ONE setup task.
 * - C8 / codex 8: "started" is recorded only once the task's first turn fired,
 *   and a failed first turn keeps the first day pending with no card left
 *   behind.
 * - R5 / T5 (a setup task left while the first day is still pending):
 *   `agent-first-day-left-task.test.ts`.
 * - C6: the first turn runs on the hire's pin, and the hello's role is read
 *   on the host.
 * - codex 6: the pending first day is born WITH the agent, in its create.
 */

let host: FirstDayHost;
beforeEach(async () => {
  host = await bootFirstDayHost();
});
afterEach(() => host.close());

test("a new hire's pending first day is born with it, in the create", async () => {
  await host.hire(PENDING);
  expect(await host.firstDay()).toBe("pending");
});

test("starting creates the setup task, fires its first turn, then records the start", async () => {
  const id = await host.hire(PENDING);
  const res = await host.start(id, { locale: "es", title: "Primer día" });
  expect(res.status).toBe(201);
  const body = (await res.json()) as FirstDayStartResult;
  expect(body).toMatchObject({
    outcome: "started",
    role: "Financial analyst",
    arrival: "created",
    mission: { title: "Primer día" },
  });
  expect(body.mission.sessionKey).toBe(`activity-${body.mission.id}`);

  const [task] = await host.setupTasks();
  expect(task).toMatchObject({
    id: body.mission.id,
    title: "Primer día",
    description: "",
    status: "running",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
  });
  expect(host.channel.fired).toHaveLength(1);
  const [fired] = host.channel.fired;
  expect(fired?.conversationId).toBe(body.mission.sessionKey);
  // C6: the hire's pin, never the engine default; a quick first card.
  expect(fired?.pin).toMatchObject({
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    effort: "low",
  });
  // Hidden from the transcript, in the user's language, naming the job.
  expect(fired?.text.startsWith(AUTO_CONTINUE_MARKER)).toBe(true);
  expect(fired?.text).toContain("The user's app is set to Spanish");
  expect(fired?.text).toContain("- Role: Financial analyst");
  expect(await host.firstDay()).toBe("started");
});

test("two starts at once make ONE setup task (C7)", async () => {
  const id = await host.hire(PENDING);
  let release = () => {};
  host.channel.gate = new Promise<void>((r) => {
    release = r;
  });
  const both = Promise.all([host.start(id), host.start(id)]);
  await new Promise((r) => setTimeout(r, 20));
  release();
  const [a, b] = await both;
  const bodies = (await Promise.all([a.json(), b.json()])) as [
    FirstDayStartResult,
    FirstDayStartResult,
  ];
  expect(bodies.map((x) => x.outcome).sort()).toEqual(["existing", "started"]);
  expect(bodies[0].mission.id).toBe(bodies[1].mission.id);
  expect(host.channel.fired).toHaveLength(1);
  expect(await host.setupTasks()).toHaveLength(1);
});

test("a failed first turn keeps the first day pending and leaves no card (C8)", async () => {
  const id = await host.hire(PENDING);
  host.channel.failWith = "runtime unavailable";
  const res = await host.start(id);
  // A domain refusal, never a gateway status the transport would retry (T6).
  expect(res.status).toBe(409);
  expect(((await res.json()) as { code: string }).code).toBe(
    "first_day_not_started",
  );
  expect(await host.firstDay()).toBe("pending");
  expect(await host.setupTasks()).toHaveLength(0);

  host.channel.failWith = null;
  expect((await host.start(id)).status).toBe(201);
  expect(await host.setupTasks()).toHaveLength(1);
});

test("once the start is recorded, a repeat hands the task back and fires nothing", async () => {
  const id = await host.hire(PENDING);
  expect((await host.start(id)).status).toBe(201);

  const res = await host.start(id);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ outcome: "existing" });
  expect(host.channel.fired).toHaveLength(1);
});

test("an employee with no pending first day and no task is refused (codex 6)", async () => {
  const id = await host.hire();
  const res = await host.start(id);
  expect(res.status).toBe(409);
  expect(((await res.json()) as { code: string }).code).toBe(
    "first_day_not_pending",
  );
  expect(host.channel.fired).toHaveLength(0);
});

test("a malformed start is refused before anything runs", async () => {
  const id = await host.hire(PENDING);
  const res = await host.start(id, { locale: 7 });
  expect(res.status).toBe(400);
  expect(host.channel.fired).toHaveLength(0);
  expect(await host.firstDay()).toBe("pending");
});
