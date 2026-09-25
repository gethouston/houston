import { afterEach, beforeEach, expect, it } from "vitest";
import { type FakeHost, startFakeHost } from "./server";

/**
 * The fake host's first-day lifecycle mirrors the real host's, so the e2e
 * suite drives the same decisions: born pending in the create, one start, a
 * repeat hands back the same task, and a config write cannot move it back.
 */

const JSON_HEADERS = { "content-type": "application/json" };
const CONFIG = ".houston/config/config.json";

let host: FakeHost;
beforeEach(async () => {
  host = await startFakeHost(0);
});
afterEach(async () => {
  await host.stop();
});

async function hire(): Promise<string> {
  const res = await fetch(`${host.url}/agents`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      name: "Aurora",
      claudeMd: "---\nindustry: Finance\nrole: Financial analyst\n---\n",
      seeds: {
        [CONFIG]: JSON.stringify({ firstDay: "pending", arrival: "created" }),
      },
    }),
  });
  return ((await res.json()) as { id: string }).id;
}

const start = (id: string) =>
  fetch(`${host.url}/agents/${id}/first-day`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ locale: "en", title: "Getting set up" }),
  });

async function storedConfig(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${host.url}/agents/${id}/agentfile/${CONFIG}`);
  return JSON.parse(((await res.json()) as { content: string }).content);
}

it("starts once, then hands back the same setup task", async () => {
  const id = await hire();
  const first = await start(id);
  expect(first.status).toBe(201);
  const started = (await first.json()) as {
    outcome: string;
    mission: { id: string; sessionKey: string };
    role: string;
    arrival: string;
  };
  expect(started).toMatchObject({
    outcome: "started",
    role: "Financial analyst",
    arrival: "created",
  });
  expect(started.mission.sessionKey).toBe(`activity-${started.mission.id}`);
  expect((await storedConfig(id)).firstDay).toBe("started");

  const again = await start(id);
  expect(again.status).toBe(200);
  expect(await again.json()).toMatchObject({
    outcome: "existing",
    mission: { id: started.mission.id },
  });
});

it("a config write keeps the host's first-day fields", async () => {
  const id = await hire();
  await start(id);
  await fetch(`${host.url}/agents/${id}/agentfile/${CONFIG}`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      content: JSON.stringify({ model: "m", firstDay: "pending" }),
    }),
  });
  expect(await storedConfig(id)).toEqual({
    model: "m",
    firstDay: "started",
    arrival: "created",
  });
});

it("an employee with no pending first day is refused", async () => {
  const res = await fetch(`${host.url}/agents`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: "Copy" }),
  });
  const { id } = (await res.json()) as { id: string };
  const refused = await start(id);
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({ code: "first_day_not_pending" });
});
