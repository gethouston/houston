import type { FirstDayStartResult } from "@houston/protocol";
import { AUTO_CONTINUE_MARKER } from "@houston/protocol";
import { afterEach, beforeEach, expect, test } from "vitest";
import { TurnFireError } from "../channel/fire-error";
import {
  bootFirstDayHost,
  type FirstDayHost,
  PENDING,
} from "../testing/first-day-harness";

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
  expect(fired?.pin).toMatchObject({
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    effort: "low",
  });
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

test("the setup task leaves firstDay pending until its first turn starts", async () => {
  const id = await host.hire(PENDING);
  let release = () => {};
  host.channel.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const starting = host.start(id);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(await host.setupTasks()).toHaveLength(1);
  expect(await host.firstDay()).toBe("pending");
  release();
  expect((await starting).status).toBe(201);
  expect(await host.firstDay()).toBe("started");
});

test("a failed first turn keeps the first day pending and leaves no card (C8)", async () => {
  const id = await host.hire(PENDING);
  host.channel.failWith = "runtime unavailable";
  const res = await host.start(id);
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

test("a first turn refused for no connected AI answers its own code and stays pending", async () => {
  const id = await host.hire(PENDING);
  host.channel.failWith = new TurnFireError(
    'runtime 409: {"error":"No provider connected","code":"no_provider"}',
    409,
    "no_provider",
  );
  const res = await host.start(id);
  expect(res.status).toBe(409);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.code).toBe("first_day_no_provider");
  expect(body.error).toBe(
    "No AI is connected to run the first day. Connect one, then start it again.",
  );
  expect(body).not.toHaveProperty("provider");
  expect(await host.firstDay()).toBe("pending");
  expect(await host.setupTasks()).toHaveLength(0);

  host.channel.failWith = new TurnFireError(
    "runtime 409",
    409,
    "no_provider",
    "anthropic",
  );
  const named = await host.start(id);
  expect(await named.json()).toMatchObject({
    code: "first_day_no_provider",
    provider: "anthropic",
  });

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

test.each([
  [true, { routineMinIntervalMinutes: 15 }],
  [false, undefined],
])("the gateway's plan stamp rides the first turn, only behind it (fronted: %s)", async (fronted, expected) => {
  const own = await bootFirstDayHost({ gatewayFronted: fronted });
  try {
    const id = await own.hire(PENDING);
    const res = await own.start(id, {
      locale: "en",
      limits: { routineMinIntervalMinutes: 15 },
    });
    expect(res.status).toBe(201);
    expect(own.channel.fired).toHaveLength(1);
    expect(own.channel.fired[0]?.limits).toEqual(expected);
  } finally {
    await own.close();
  }
});
