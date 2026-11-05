import { HoustonClient } from "@houston/engine-adapter/client";
import { disposeAllStreams } from "@houston/engine-adapter/turn-stream";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { activityWrites } from "../../../app/src/data/activity-writes";
import {
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The board READS delegated to `@houston/sdk`: `listActivities` and the
 * generic `updateActivity` PATCH (create and delete are pinned in
 * `wire-writes.test.ts`).
 *
 * These assertions ARE the record of what those calls put on the wire: same
 * method, whole URL, body bytes, and
 * headers (`Content-Type`, the `Authorization` bearer, the live `x-houston-org`)
 * over the ONE shared gateway fetch. A read publishes no SDK scope and a write
 * never refetches, so each call is exactly one request.
 *
 * The 404 disposition is asserted too: neither operation degrades — the board
 * read failing is what `listAllConversations` reports as a failed agent, and a
 * swallowed PATCH would leave a settled mission stuck on "running".
 */

const BASE = "http://host";

const {
  calls,
  reset,
  restore,
  stubResponses: stubFetch,
  stubRouted,
} = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  disposeAllStreams();
  restore();
  vi.clearAllMocks();
});

const client = () =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane: true });

const mission = {
  id: "m1",
  title: "Plan a trip",
  description: "",
  status: "running",
  session_key: "sk-1",
  updated_at: "2026-01-01T00:00:00.000Z",
};

// ---- listActivities ----

test("listActivities delegates a byte-identical single GET /agents/:id/activities", async () => {
  stubFetch(json(200, { items: [mission] }));

  const rows = await client().listActivities("a1");

  expect(calls).toHaveLength(1); // the read publishes no scope: one request
  const [get] = calls;
  expect(get.method).toBe("GET");
  expect(get.url).toBe(`${BASE}/agents/a1/activities`);
  expect(get.body).toBeNull();
  expect(get.headers.get("Content-Type")).toBe("application/json");
  expect(get.headers.get("Authorization")).toBe("Bearer t");
  // The `{ items }` envelope is unwrapped exactly as the cp copy unwrapped it.
  expect(rows).toEqual([mission]);
});

test("listActivities carries the live x-houston-org", async () => {
  stubFetch(json(200, { items: [] }));
  const c = client();
  c.setActiveOrg(ORG);
  await c.listActivities("a1");
  expect(calls[0].headers.get("x-houston-org")).toBe(ORG);
});

test("listActivities percent-encodes the agent id it splices", async () => {
  stubFetch(json(200, { items: [] }));
  await client().listActivities("Home/Ada");
  expect(calls[0].url).toBe(`${BASE}/agents/Home%2FAda/activities`);
});

test("a failed board read propagates as the adapter's engine error", async () => {
  stubFetch(json(404, { error: "no such agent" }));
  await expect(client().listActivities("a1")).rejects.toMatchObject({
    name: "HoustonEngineError",
    status: 404,
  });
});

// ---- updateActivity ----

test("updateActivity delegates a byte-identical single PATCH of the WHOLE update", async () => {
  stubFetch(json(200, { ...mission, status: "done" }));

  const updated = await client().updateActivity("a1", "m1", {
    status: "done",
    pending_interaction: null,
  });

  expect(calls).toHaveLength(1); // no post-write refetch
  const [patch] = calls;
  expect(patch.method).toBe("PATCH");
  expect(patch.url).toBe(`${BASE}/agents/a1/activities/m1`);
  // One request carries every field the caller changed — a settle writes its
  // status and clears its interaction together, or the card publishes half-done.
  expect(patch.body).toBe(
    JSON.stringify({ status: "done", pending_interaction: null }),
  );
  expect(patch.headers.get("Content-Type")).toBe("application/json");
  expect(patch.headers.get("Authorization")).toBe("Bearer t");
  expect(updated.status).toBe("done");
});

test("updateActivity carries the live x-houston-org", async () => {
  stubFetch(json(200, mission));
  const c = client();
  c.setActiveOrg(ORG);
  await c.updateActivity("a1", "m1", { title: "Renamed" });
  expect(calls[0].headers.get("x-houston-org")).toBe(ORG);
});

test("updateActivity percent-encodes both spliced ids", async () => {
  stubFetch(json(200, mission));
  await client().updateActivity("Home/Ada", "m 1/2", { title: "t" });
  expect(calls[0].url).toBe(`${BASE}/agents/Home%2FAda/activities/m%201%2F2`);
});

test("a failed mission update propagates — never swallowed", async () => {
  stubFetch(json(404, { error: "no such mission" }));
  await expect(
    client().updateActivity("a1", "m1", { status: "done" }),
  ).rejects.toMatchObject({ name: "HoustonEngineError", status: 404 });
});

test("a provider-refused send stamps start but never its error settle", async () => {
  stubRouted((call) => {
    if (call.url.endsWith("/v1/preferences/next_step_suggestions"))
      return json(200, { value: null });
    if (call.url.includes("/activities"))
      return call.method === "GET"
        ? json(200, { items: [mission] })
        : json(200, mission);
    if (call.url.endsWith("/events")) return new Response("");
    return json(400, {
      error: "No provider connected. Connect your subscription first.",
    });
  });
  await client().startSession("a1", { sessionKey: "sk-1", prompt: "Hello" });
  await vi.waitFor(() =>
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2),
  );
  const patches = calls.filter((c) => c.method === "PATCH");
  expect(patches.map((c) => c.url)).toEqual([
    "http://host/agents/a1/activities/m1?stamp=last_message",
    "http://host/agents/a1/activities/m1",
  ]);
  expect(patches.map((c) => c.body)).toEqual([
    '{"status":"running","pending_interaction":null}',
    '{"status":"needs_you","pending_interaction":null}',
  ]);
  expect(patches[0].headers.get("Authorization")).toBe("Bearer t");
  expect(patches[0].headers.get("Content-Type")).toBe("application/json");
});

test("orphan Stop preserves the message timestamp by omitting the stamp", async () => {
  stubRouted((call) =>
    call.url.includes("/activities")
      ? call.method === "GET"
        ? json(200, { items: [mission] })
        : json(200, mission)
      : json(200, { cancelled: false }),
  );
  await client().cancelSession("a1", "sk-1");
  expect(calls.find((c) => c.method === "PATCH")?.url).toBe(
    "http://host/agents/a1/activities/m1",
  );
});

test("reopening an idle conversation never stamps a message", async () => {
  stubRouted((call) => {
    if (call.url.endsWith("/events"))
      return new Response(
        'data: {"type":"sync","data":{"running":false,"partial":"","seq":0},"seq":0}\n\n',
      );
    if (call.url.includes("/agentfile/")) return json(200, { content: "" });
    return json(200, { id: "sk-1", title: "Draft", messages: [] });
  });
  await client().loadChatHistory("a1", "sk-1");
  expect(calls.filter((c) => c.method === "PATCH")).toEqual([]);
});

test("the app's whole-file PUT preserves the last message when clearing a warming pin", async () => {
  const row = {
    ...mission,
    provider: "anthropic",
    model: "sonnet",
    last_message_at: "2026-10-26T10:00:00.000Z",
  };
  stubRouted((call) =>
    call.method === "GET"
      ? json(200, { content: JSON.stringify([row]) })
      : json(200),
  );
  const c = client();
  const writes = activityWrites({
    list: async (path) =>
      JSON.parse(
        await c.readAgentFile(path, ".houston/activity/activity.json"),
      ),
    write: (path, items) =>
      c.writeAgentFile(
        path,
        ".houston/activity/activity.json",
        JSON.stringify(items),
      ),
    now: () => "2026-10-27T17:00:00.000Z",
    newId: () => "unused",
  });
  await writes.update("a1", "m1", { provider: null, model: null });
  const put = calls.find((call) => call.method === "PUT");
  expect(put?.url).toBe(
    "http://host/agents/a1/agentfile/.houston/activity/activity.json",
  );
  expect(put?.body).toBe(
    '{"content":"[{\\"id\\":\\"m1\\",\\"title\\":\\"Plan a trip\\",\\"description\\":\\"\\",\\"status\\":\\"running\\",\\"session_key\\":\\"sk-1\\",\\"updated_at\\":\\"2026-10-27T17:00:00.000Z\\",\\"last_message_at\\":\\"2026-10-26T10:00:00.000Z\\"}]"}',
  );
});

test("settling a turn observed on reopen omits the message stamp", async () => {
  stubRouted((call) => {
    if (call.url.includes("/activities"))
      return call.method === "GET"
        ? json(200, { items: [mission] })
        : json(200, mission);
    if (call.url.endsWith("/events"))
      return new Response(
        'data: {"type":"sync","data":{"running":true,"partial":"","seq":0,"turnId":"observed"},"seq":0}\n\ndata: {"type":"done","turnId":"observed","data":null,"seq":1}\n\n',
        { headers: { "Content-Type": "text/event-stream" } },
      );
    if (call.url.includes("/agentfile/")) return json(200, { content: "" });
    return json(200, { id: "sk-1", title: "Draft", messages: [] });
  });
  await client().loadChatHistory("a1", "sk-1");
  await vi.waitFor(() =>
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(1),
  );
  const patch = calls.find((call) => call.method === "PATCH");
  expect(patch?.url).toBe("http://host/agents/a1/activities/m1");
  expect(patch?.body).toBe('{"status":"needs_you","pending_interaction":null}');
});
