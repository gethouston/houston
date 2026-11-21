import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import {
  AGENT_SETUP_AGENT_MODE,
  docKey,
  loadConfig,
  saveConfig,
  type TextStore,
} from "@houston/domain";
import type { Activity, HoustonEvent } from "@houston/protocol";
import { afterEach, expect, test, vi } from "vitest";
import { handleActivitiesData } from "./agent-data-activities";

const ROOT = "ws/agent";
const KEY = docKey(ROOT, "activity");

afterEach(() => vi.restoreAllMocks());

test("a user-created mission retires a pending first day", async () => {
  const store = slowStore();
  const events: HoustonEvent[] = [];
  await saveConfig(store, ROOT, { firstDay: "pending", model: "sonnet" });
  const result = await post(store, { title: "Start working" }, (event) =>
    events.push(event),
  );
  expect(result.status).toBe(201);
  expect((await loadConfig(store, ROOT)).config).toMatchObject({
    firstDay: "started",
    model: "sonnet",
  });
  expect(events).toContainEqual({
    type: "ConfigChanged",
    agentPath: "agent-1",
  });
});

test.each([
  "started",
  undefined,
] as const)("a user-created mission leaves firstDay %s untouched", async (firstDay) => {
  const store = slowStore();
  await saveConfig(store, ROOT, firstDay ? { firstDay } : { model: "sonnet" });
  const write = vi.spyOn(store, "writeText");
  expect((await post(store, { title: "Start working" })).status).toBe(201);
  expect(write).not.toHaveBeenCalledWith(
    docKey(ROOT, "config"),
    expect.anything(),
  );
});

test("a failed config write does not fail a user-created mission", async () => {
  const store = slowStore();
  await saveConfig(store, ROOT, { firstDay: "pending" });
  const write = store.writeText.bind(store);
  vi.spyOn(store, "writeText").mockImplementation((key, content) =>
    key === docKey(ROOT, "config")
      ? Promise.reject(new Error("config unavailable"))
      : write(key, content),
  );
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const result = await post(store, { title: "Start working" });
  expect(result.status).toBe(201);
  expect(storedItems(store)).toHaveLength(1);
  expect((await loadConfig(store, ROOT)).config.firstDay).toBe("pending");
  expect(logged).toHaveBeenCalledWith(
    expect.stringContaining("retiring pending start failed"),
    expect.any(Error),
  );
});

test("a setup task does not retire its own pending first day", async () => {
  const store = slowStore();
  await saveConfig(store, ROOT, { firstDay: "pending" });
  const result = await post(store, {
    title: "Getting set up",
    agent: AGENT_SETUP_AGENT_MODE,
  });
  expect(result.status).toBe(201);
  expect((await loadConfig(store, ROOT)).config.firstDay).toBe("pending");
});

function slowStore(): TextStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async readText(key) {
      const snapshot = data.get(key) ?? null;
      await new Promise((r) => setTimeout(r, 5));
      return snapshot;
    },
    async writeText(key, content) {
      data.set(key, content);
    },
  };
}

function request(body: unknown): IncomingMessage {
  const req = Readable.from([
    Buffer.from(JSON.stringify(body)),
  ]) as unknown as IncomingMessage;
  (req as { headers: Record<string, string> }).headers = {};
  return req;
}

function response(): ServerResponse & { status: number; body: unknown } {
  const res = {
    status: 0,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(buf?: Buffer) {
      if (buf) res.body = JSON.parse(buf.toString("utf8"));
    },
  };
  return res as unknown as ServerResponse & { status: number; body: unknown };
}

function post(
  store: TextStore,
  body: Record<string, unknown>,
  emit?: (event: HoustonEvent) => void,
) {
  const res = response();
  return handleActivitiesData(
    store,
    ROOT,
    "agent-1",
    "POST",
    null,
    request(body),
    res,
    emit,
  ).then(() => res);
}

function patch(store: TextStore, id: string, body: Record<string, unknown>) {
  const res = response();
  return handleActivitiesData(
    store,
    ROOT,
    "agent-1",
    "PATCH",
    id,
    request(body),
    res,
  ).then(() => res);
}

const storedItems = (store: { data: Map<string, string> }): Activity[] =>
  JSON.parse(store.data.get(KEY) ?? "[]");

test("two concurrent creates both land in the doc", async () => {
  const store = slowStore();
  const [a, b] = await Promise.all([
    post(store, { id: "id-a", title: "Mission A" }),
    post(store, { id: "id-b", title: "Mission B" }),
  ]);
  expect(a.status).toBe(201);
  expect(b.status).toBe(201);
  const ids = storedItems(store).map((i) => i.id);
  expect(ids).toContain("id-a");
  expect(ids).toContain("id-b");
});

test("a concurrent patch never erases a concurrent create", async () => {
  const store = slowStore();
  await post(store, { id: "id-a", title: "Mission A" });
  const [created, patched] = await Promise.all([
    post(store, { id: "id-b", title: "Mission B" }),
    patch(store, "id-a", { status: "done" }),
  ]);
  expect(created.status).toBe(201);
  expect(patched.status).toBe(200);
  const items = storedItems(store);
  expect(items.map((i) => i.id).sort()).toEqual(["id-a", "id-b"]);
  expect(items.find((i) => i.id === "id-a")?.status).toBe("done");
});

test("activity PATCH validates and deletes null provider/model pins", async () => {
  const store = slowStore();
  await post(store, {
    id: "id-pinned",
    title: "Pinned",
    provider: "anthropic",
    model: "sonnet",
  });
  const cleared = await patch(store, "id-pinned", {
    provider: null,
    model: null,
  });
  expect(cleared.status).toBe(200);
  expect(storedItems(store)[0]).not.toHaveProperty("provider");
  expect(storedItems(store)[0]).not.toHaveProperty("model");

  const invalid = await patch(store, "id-pinned", { provider: 42 });
  expect(invalid.status).toBe(400);
});

test("a blank rename is refused, so no card is left without a name", async () => {
  const store = slowStore();
  await post(store, { id: "id-named", title: "Deck for Tuesday" });
  const blank = await patch(store, "id-named", { title: "  " });
  expect(blank.status).toBe(400);
  expect(storedItems(store)[0]?.title).toBe("Deck for Tuesday");
});

test("create conflicts without replacing an existing mission or provenance", async () => {
  const store = slowStore();
  await post(store, { id: "existing", title: "Original" });
  await patch(store, "existing", { status: "done" });
  const original = store.data.get(KEY);
  const result = await post(store, { id: "existing", title: "Replacement" });
  expect(result.status).toBe(409);
  expect(result.body).toMatchObject({ code: "activity_exists" });
  expect(store.data.get(KEY)).toBe(original);
});

test("the same create repeated answers with the row already on the board", async () => {
  const store = slowStore();
  await post(store, { id: "warming", title: "Warm-up", description: "d" });
  await patch(store, "warming", { status: "done" });
  const settled = store.data.get(KEY);
  const retried = await post(store, {
    id: "warming",
    title: "Warm-up",
    description: "d",
  });
  expect(retried.status).toBe(201);
  expect(retried.body).toMatchObject({ id: "warming", status: "done" });
  expect(store.data.get(KEY)).toBe(settled);
});
test("concurrent same-id creates produce one conflict", async () => {
  const store = slowStore();
  const results = await Promise.all([
    post(store, { id: "same", title: "A" }),
    post(store, { id: "same", title: "B" }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
});
