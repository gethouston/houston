import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { docKey, type TextStore } from "@houston/domain";
import type { Activity } from "@houston/protocol";
import { expect, test } from "vitest";
import { handleActivitiesData } from "./agent-data-activities";

/**
 * Concurrent mutations of one agent's activity doc must serialize. Before the
 * doc lock, two simultaneous creates both loaded the same base list and the
 * last save dropped the other's entry — a double-fired first-message submit
 * lost a mission's board entry this way in production (its conversation
 * persisted fine but became unreachable in the UI).
 */

const ROOT = "ws/agent";
const KEY = docKey(ROOT, "activity");

/** In-memory TextStore that snapshots the value at read START and only
 * returns it after yielding to the event loop — the remote-store shape
 * (GCS/fs) where a concurrent writer's save lands between a reader's
 * snapshot and its continuation. Without serialization, two load→save
 * mutations interleave on this store and the last save deterministically
 * drops the other's entry. */
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

function post(store: TextStore, body: Record<string, unknown>) {
  const res = response();
  return handleActivitiesData(
    store,
    ROOT,
    "agent-1",
    "POST",
    null,
    request(body),
    res,
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
