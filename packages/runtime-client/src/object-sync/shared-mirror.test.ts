import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { HttpObjectStore } from "./http-store";
import { syncSharedMirror } from "./shared-mirror";

const md5 = (body: Buffer) => createHash("md5").update(body).digest("base64");

interface FakePodStore {
  baseUrl: string;
  failNext(key: string): void;
  objects: Map<string, Buffer>;
  requests: Array<{ agent?: string; url?: string }>;
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function fakePodStore(
  initial: Record<string, string>,
): Promise<FakePodStore> {
  const objects = new Map(
    Object.entries(initial).map(([key, value]) => [key, Buffer.from(value)]),
  );
  const failures = new Set<string>();
  const requests: FakePodStore["requests"] = [];
  const server = createServer((req, res) => {
    requests.push({
      agent: req.headers["x-houston-agent"] as string | undefined,
      url: req.url,
    });
    const url = new URL(req.url ?? "/", "http://pod-store");
    if (url.pathname.endsWith("/shared/manifest")) {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          objects: [...objects.entries()].map(([key, body]) => ({
            key,
            size: body.length,
            md5: md5(body),
            updated: "2026-07-30T00:00:00Z",
          })),
        }),
      );
      return;
    }
    const marker = "/shared/objects/";
    const index = url.pathname.indexOf(marker);
    const key = url.pathname
      .slice(index + marker.length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    const body = objects.get(key);
    if (failures.delete(key)) {
      res.writeHead(503);
      res.end("download interrupted");
      return;
    }
    if (!body) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.end(body);
  });
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1/pod/store/acme/shared`,
    failNext: (key) => failures.add(key),
    objects,
    requests,
  };
}

test("mirrors new and changed skills, deletes vanished skills, and ignores other shared families", async () => {
  const remote = await fakePodStore({
    "skills/research/SKILL.md": "research v1",
    "skills/remove/SKILL.md": "remove me",
    "context/ORG.md": "not a skill",
  });
  const mirrorDir = mkdtempSync(join(tmpdir(), "shared-mirror-"));
  await mkdir(join(mirrorDir, "skills", "stale"), { recursive: true });
  await mkdir(join(mirrorDir, "context"), { recursive: true });
  writeFileSync(join(mirrorDir, "skills", "stale", "SKILL.md"), "stale");
  writeFileSync(join(mirrorDir, "context", "LOCAL.md"), "leave me");
  const store = new HttpObjectStore({
    baseUrl: remote.baseUrl,
    token: "pod-token",
    agentSlug: "writer",
  });

  const first = await syncSharedMirror({ store, mirrorDir });
  expect(first.downloaded).toEqual([
    "skills/remove/SKILL.md",
    "skills/research/SKILL.md",
  ]);
  expect(first.deleted).toEqual(["skills/stale/SKILL.md"]);
  expect(
    readFileSync(join(mirrorDir, "skills", "research", "SKILL.md"), "utf8"),
  ).toBe("research v1");
  expect(readFileSync(join(mirrorDir, "context", "LOCAL.md"), "utf8")).toBe(
    "leave me",
  );

  remote.objects.set("skills/research/SKILL.md", Buffer.from("research v2"));
  remote.objects.set("skills/write/SKILL.md", Buffer.from("write v1"));
  remote.objects.delete("skills/remove/SKILL.md");
  const second = await syncSharedMirror({
    store,
    mirrorDir,
  });
  expect(second.downloaded).toEqual([
    "skills/research/SKILL.md",
    "skills/write/SKILL.md",
  ]);
  expect(second.deleted).toEqual(["skills/remove/SKILL.md"]);
  expect(
    readFileSync(join(mirrorDir, "skills", "research", "SKILL.md"), "utf8"),
  ).toBe("research v2");
  expect(remote.requests.every((request) => request.agent === "writer")).toBe(
    true,
  );
});

test("a partial download failure preserves old files and self-heals on the next sync", async () => {
  const remote = await fakePodStore({
    "skills/a/SKILL.md": "a v1",
    "skills/b/SKILL.md": "b v1",
  });
  const mirrorDir = mkdtempSync(join(tmpdir(), "shared-mirror-repair-"));
  const store = new HttpObjectStore({
    baseUrl: remote.baseUrl,
    token: "pod-token",
    agentSlug: "writer",
    retryDelaysMs: [],
  });
  await syncSharedMirror({ store, mirrorDir });

  remote.objects.set("skills/a/SKILL.md", Buffer.from("a v2"));
  remote.objects.set("skills/b/SKILL.md", Buffer.from("b v2"));
  remote.failNext("skills/b/SKILL.md");
  await expect(syncSharedMirror({ store, mirrorDir })).rejects.toThrow(
    "download interrupted",
  );
  expect(readFileSync(join(mirrorDir, "skills", "a", "SKILL.md"), "utf8")).toBe(
    "a v2",
  );
  expect(readFileSync(join(mirrorDir, "skills", "b", "SKILL.md"), "utf8")).toBe(
    "b v1",
  );

  const repaired = await syncSharedMirror({
    store,
    mirrorDir,
  });
  expect(repaired.downloaded).toEqual(["skills/b/SKILL.md"]);
  expect(readFileSync(join(mirrorDir, "skills", "b", "SKILL.md"), "utf8")).toBe(
    "b v2",
  );
});

test("an unchanged remote manifest repairs a same-size corrupted local file", async () => {
  const remote = await fakePodStore({
    "skills/a/SKILL.md": "good",
  });
  const mirrorDir = mkdtempSync(join(tmpdir(), "shared-mirror-corrupt-"));
  const store = new HttpObjectStore({
    baseUrl: remote.baseUrl,
    token: "pod-token",
    agentSlug: "writer",
  });
  await syncSharedMirror({ store, mirrorDir });
  writeFileSync(join(mirrorDir, "skills", "a", "SKILL.md"), "evil");

  const repaired = await syncSharedMirror({ store, mirrorDir });

  expect(repaired.downloaded).toEqual(["skills/a/SKILL.md"]);
  expect(readFileSync(join(mirrorDir, "skills", "a", "SKILL.md"), "utf8")).toBe(
    "good",
  );
});
