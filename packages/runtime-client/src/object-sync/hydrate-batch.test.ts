import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { HttpObjectStore } from "./http-store";
import { hydrate } from "./hydrate";

function frame(key: string, status: number, body = "", generation?: string) {
  const header = Buffer.from(
    JSON.stringify({
      key,
      status,
      size: Buffer.byteLength(body),
      ...(generation ? { generation } : {}),
    }),
  );
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return Buffer.concat([length, header, Buffer.from(body)]);
}

function fakeStore(
  batchRoute: boolean,
  batchReads = true,
  extra: Record<string, string> = {},
) {
  const objects: Record<string, string> = {
    "CLAUDE.md": "instructions",
    ".houston/learnings.md": "notes",
    "gone.md": "deleted after listing",
    "big.bin": "large object",
    ...extra,
  };
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push(`${init?.method ?? "GET"} ${path.split("/agent")[1]}`);
    if (path.endsWith("/manifest")) {
      return Response.json({
        objects: Object.entries(objects).map(([key, body]) => ({
          key,
          size: body.length,
          md5: "m",
          updated: "2026-09-24T00:00:00Z",
          gen: 7,
        })),
      });
    }
    if (path.endsWith("/batch")) {
      if (!batchRoute) return new Response("", { status: 404 });
      const { keys } = JSON.parse(String(init?.body)) as { keys: string[] };
      const frames = keys.map((key) => {
        if (key === "gone.md") return frame(key, 404);
        if (key === "big.bin") return frame(key, 413);
        return frame(key, 200, objects[key], "7");
      });
      return new Response(Buffer.concat(frames));
    }
    const key = decodeURIComponent(path.split("/objects/")[1] ?? "");
    return key in objects && key !== "gone.md"
      ? new Response(objects[key])
      : new Response('{"error":"object not found"}', { status: 404 });
  };
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/v1/pod/store/org/agent",
    token: "t",
    fetchImpl,
    batchReads,
  });
  return { store, calls };
}

test("hydration lands small objects in one batch and falls back for the rest", async () => {
  const { store, calls } = fakeStore(true);
  const dest = mkdtempSync(join(tmpdir(), "houston-batch-"));

  const manifest = await hydrate(store, "", dest);

  expect(readFileSync(join(dest, "CLAUDE.md"), "utf8")).toBe("instructions");
  expect(readFileSync(join(dest, ".houston/learnings.md"), "utf8")).toBe(
    "notes",
  );
  expect(readFileSync(join(dest, "big.bin"), "utf8")).toBe("large object");
  expect(existsSync(join(dest, "gone.md"))).toBe(false);
  expect([...manifest.keys()].sort()).toEqual([
    ".houston/learnings.md",
    "CLAUDE.md",
    "big.bin",
  ]);
  expect(manifest.get("CLAUDE.md")?.generation).toBe("7");
  expect(calls).toEqual([
    "GET /manifest",
    "POST /batch",
    "GET /objects/big.bin",
  ]);
});

test("a store without the batch route hydrates one object at a time", async () => {
  const { store, calls } = fakeStore(false);
  const dest = mkdtempSync(join(tmpdir(), "houston-batch-"));

  const manifest = await hydrate(store, "", dest);

  expect([...manifest.keys()].sort()).toEqual([
    ".houston/learnings.md",
    "CLAUDE.md",
    "big.bin",
  ]);
  expect(calls.filter((call) => call.startsWith("GET /objects/")).length).toBe(
    4,
  );
});

test("a store that did not opt into batch reads never asks the batch route", async () => {
  const { store, calls } = fakeStore(true, false);
  const dest = mkdtempSync(join(tmpdir(), "houston-batch-"));

  const manifest = await hydrate(store, "", dest);

  expect(store.downloadMany).toBeUndefined();
  expect([...manifest.keys()].sort()).toEqual([
    ".houston/learnings.md",
    "CLAUDE.md",
    "big.bin",
  ]);
  expect(calls.some((call) => call.includes("/batch"))).toBe(false);
  expect(calls.filter((call) => call.startsWith("GET /objects/")).length).toBe(
    4,
  );
});

test("a batched worker hydration keeps the board's bytes as its merge base", async () => {
  const board = "workspaces/W/A/.houston/activity/activity.json";
  const body = '[{"id":"a","title":"A","status":"running"}]';
  const { store, calls } = fakeStore(true, true, { [board]: body });
  const dest = mkdtempSync(join(tmpdir(), "houston-batch-"));

  const manifest = await hydrate(store, "", dest, { keepMergeBase: true });

  expect(calls).toContain("POST /batch");
  expect(manifest.get(board)?.mergeBase).toBe(body);
  expect(manifest.get("CLAUDE.md")?.mergeBase).toBeUndefined();
});
