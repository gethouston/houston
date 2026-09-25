import { afterEach, beforeEach, expect, test } from "vitest";
import { turnBusyError } from "../channel/fire-error";
import {
  bootFirstDayHost,
  type FirstDayHost,
  PENDING,
} from "../testing/first-day-harness";

/**
 * A setup task that exists while the config still says pending is one whose
 * start never recorded its turn: the host stopped between the two, or the
 * record failed after an accepted turn.
 *
 * - R5: it gets its first turn, never a second task.
 * - T5: a start never takes it off the board. Its turn may be running (the
 *   agent is busy with THAT task's conversation), which records the start and
 *   hands the task back; a slot busy with any other conversation, or any
 *   other failure, leaves it, still pending, for the next start to fire.
 * - T6: a start that cannot fire is a domain refusal (409), never a gateway
 *   status the transport's wake ladder would retry into more fires.
 */

let host: FirstDayHost;
beforeEach(async () => {
  host = await bootFirstDayHost();
});
afterEach(() => host.close());

/** The agent's one turn slot is taken by a turn in `conversationId`. */
const busyIn = (conversationId: string) => turnBusyError(conversationId);

test("a left task gets its first turn, then the start is recorded (R5)", async () => {
  const id = await host.hire(PENDING);
  await host.leaveUnfiredTask();

  const res = await host.start(id);
  expect(res.status).toBe(201);
  expect(await res.json()).toMatchObject({
    outcome: "started",
    mission: { id: "m-1", sessionKey: "activity-m-1" },
  });
  expect(host.channel.fired).toHaveLength(1);
  expect(host.channel.fired[0]?.conversationId).toBe("activity-m-1");
  expect(await host.setupTasks()).toHaveLength(1);
  expect(await host.firstDay()).toBe("started");
});

test("a left task whose turn is still running is recorded and handed back, never dropped (T5)", async () => {
  const id = await host.hire(PENDING);
  await host.leaveUnfiredTask();
  host.channel.failWith = busyIn("activity-m-1");

  const res = await host.start(id);
  expect(res.status).toBe(201);
  expect(await res.json()).toMatchObject({
    outcome: "started",
    mission: { id: "m-1", sessionKey: "activity-m-1" },
  });
  expect((await host.setupTasks()).map((t) => t.id)).toEqual(["m-1"]);
  expect(await host.firstDay()).toBe("started");
});

test("a left task is not recorded when the agent is busy with another conversation (T5)", async () => {
  const id = await host.hire(PENDING);
  await host.leaveUnfiredTask();
  host.channel.failWith = busyIn("activity-other");

  const res = await host.start(id);
  expect(res.status).toBe(409);
  expect(((await res.json()) as { code: string }).code).toBe(
    "first_day_not_started",
  );
  expect((await host.setupTasks()).map((t) => t.id)).toEqual(["m-1"]);
  expect(await host.firstDay()).toBe("pending");
});

test("a left task whose first turn cannot fire stays on the board, still pending (T5, T6)", async () => {
  const id = await host.hire(PENDING);
  await host.leaveUnfiredTask();
  host.channel.failWith = "runtime unavailable";

  const res = await host.start(id);
  expect(res.status).toBe(409);
  expect(((await res.json()) as { code: string }).code).toBe(
    "first_day_not_started",
  );
  expect((await host.setupTasks()).map((t) => t.id)).toEqual(["m-1"]);
  expect(await host.firstDay()).toBe("pending");

  host.channel.failWith = null;
  expect((await host.start(id)).status).toBe(201);
  expect(host.channel.fired.map((f) => f.conversationId)).toEqual([
    "activity-m-1",
    "activity-m-1",
  ]);
  expect(await host.setupTasks()).toHaveLength(1);
  expect(await host.firstDay()).toBe("started");
});

test("a task this start created is dropped when its turn is refused as busy", async () => {
  const id = await host.hire(PENDING);
  host.channel.failWith = busyIn("activity-other");

  const res = await host.start(id);
  expect(res.status).toBe(409);
  expect(await host.setupTasks()).toHaveLength(0);
  expect(await host.firstDay()).toBe("pending");
});
