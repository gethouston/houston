import { HoustonClient } from "@houston/engine-adapter/client";
import { planMissionTitle } from "@houston/sdk";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  type Call,
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

const BASE = "http://host";
const AGENT = "a1";
const TEXT = "Write the weekly sales report for the whole east coast team";
const FALLBACK = "Write the weekly sales report for the...";
const TITLE = { fallback: FALLBACK, text: TEXT };

const { calls, reset, restore, stubRouted } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

const client = () => {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
};

function stubEngine(title: () => Response) {
  stubRouted((call: Call) => {
    if (call.url.endsWith("/events")) return new Response("", { status: 200 });
    if (call.url.endsWith("/title")) return title();
    if (call.method === "PATCH")
      return json(200, { id: "m1", title: "x", status: "running" });
    return json(200, { ok: true, messages: [] });
  });
}

let mission = 0;

async function send(plan: ReturnType<typeof planMissionTitle>) {
  mission += 1;
  await client().startSession(AGENT, {
    sessionKey: `activity-m${mission}`,
    prompt: TEXT,
    missionTitle: plan.send,
  });
  return vi.waitUntil(() =>
    calls.find((c) => c.method === "POST" && c.url.endsWith("/messages")),
  );
}

test("server-titled deployment: the send carries missionTitle and no title call follows", async () => {
  stubEngine(() => json(200, { title: "Weekly sales report" }));
  const plan = planMissionTitle({ missionTitleOnSend: true }, TITLE);

  const post = await send(plan);
  await client().titleMissionFromClient(AGENT, "m1", plan.client);

  const body = JSON.parse(post.body ?? "{}") as Record<string, unknown>;
  expect(body.missionTitle).toEqual(TITLE);
  expect(calls.some((c) => c.url.endsWith("/title"))).toBe(false);
  expect(calls.some((c) => c.method === "PATCH")).toBe(false);
});

test.each([
  ["absent", {}],
  ["false", { missionTitleOnSend: false }],
  ["not loaded", null],
])("capability %s: the send has no missionTitle, then POST /title and the PATCH", async (_label, caps) => {
  stubEngine(() => json(200, { title: '"Weekly sales report."' }));
  const plan = planMissionTitle(caps, TITLE);

  const post = await send(plan);
  expect(post.body).not.toContain("missionTitle");
  await client().titleMissionFromClient(AGENT, "m1", plan.client);

  const title = calls.find((c) => c.url.endsWith("/title"));
  expect(title?.method).toBe("POST");
  expect(title?.url).toBe(`${BASE}/agents/${AGENT}/title`);
  expect(title?.body).toBe(JSON.stringify({ text: TEXT }));
  if (title) expectGatewayHeaders(title);
  const patch = calls.find((c) => c.method === "PATCH");
  expect(patch?.url).toBe(`${BASE}/agents/${AGENT}/activities/m1`);
  expect(patch?.body).toBe(JSON.stringify({ title: "Weekly sales report" }));
});

test("a runtime that cannot title falls back to truncation, PATCHed only when it differs", async () => {
  stubEngine(() => json(503, { error: "engine waking" }));

  await client().titleMissionFromClient(AGENT, "m1", TITLE);

  const patch = calls.find((c) => c.method === "PATCH");
  expect(patch?.body).toBe(
    JSON.stringify({ title: "Write the weekly sales report for" }),
  );
});

test("an answer equal to the fallback writes nothing", async () => {
  stubEngine(() => json(200, { title: "plan a trip" }));

  await client().titleMissionFromClient(AGENT, "m1", {
    fallback: "plan a trip",
    text: "plan a trip",
  });

  expect(calls.filter((c) => c.url.endsWith("/title"))).toHaveLength(1);
  expect(calls.some((c) => c.method === "PATCH")).toBe(false);
});
