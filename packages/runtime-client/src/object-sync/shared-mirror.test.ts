import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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
  raceNext(key: string, body: string): void;
  requests: Array<{
    agent?: string;
    generationMatch?: string;
    method?: string;
    url?: string;
  }>;
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
  const objects = new Map<string, Buffer>(
    Object.entries(initial).map(([key, value]) => [key, Buffer.from(value)]),
  );
  const failures = new Set<string>();
  const generations = new Map([...objects.keys()].map((key) => [key, 1]));
  const races = new Map<string, Buffer>();
  const requests: FakePodStore["requests"] = [];
  const server = createServer((req, res) => {
    requests.push({
      agent: req.headers["x-houston-agent"] as string | undefined,
      generationMatch: req.headers["x-houston-if-generation-match"] as
        | string
        | undefined,
      method: req.method,
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
            gen: String(generations.get(key) ?? 1),
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
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const uploaded = Buffer.concat(chunks);
        const raced = races.get(key);
        if (raced) {
          races.delete(key);
          objects.set(key, raced);
          generations.set(key, (generations.get(key) ?? 0) + 1);
        }
        const expected = req.headers["x-houston-if-generation-match"];
        const current = objects.has(key)
          ? String(generations.get(key) ?? 1)
          : "0";
        if (expected !== undefined && expected !== current) {
          res.writeHead(412);
          res.end("generation conflict");
          return;
        }
        objects.set(key, uploaded);
        const generation = (generations.get(key) ?? 0) + 1;
        generations.set(key, generation);
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            key,
            size: uploaded.length,
            md5: md5(uploaded),
            updated: "2026-07-30T00:00:01Z",
            gen: String(generation),
          }),
        );
      });
      return;
    }
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
    raceNext: (key, body) => races.set(key, Buffer.from(body)),
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
  const initial = await syncSharedMirror({ store, mirrorDir });

  remote.objects.set("skills/a/SKILL.md", Buffer.from("a v2"));
  remote.objects.set("skills/b/SKILL.md", Buffer.from("b v2"));
  remote.failNext("skills/b/SKILL.md");
  await expect(
    syncSharedMirror({ store, mirrorDir, state: initial.state }),
  ).rejects.toThrow("download interrupted");
  expect(readFileSync(join(mirrorDir, "skills", "a", "SKILL.md"), "utf8")).toBe(
    "a v2",
  );
  expect(readFileSync(join(mirrorDir, "skills", "b", "SKILL.md"), "utf8")).toBe(
    "b v1",
  );

  const repaired = await syncSharedMirror({
    store,
    mirrorDir,
    state: initial.state,
  });
  expect(repaired.uploaded).toEqual([]);
  expect(repaired.downloaded).toEqual(["skills/b/SKILL.md"]);
  expect(readFileSync(join(mirrorDir, "skills", "b", "SKILL.md"), "utf8")).toBe(
    "b v2",
  );
});

test("uploads a local edit before pulling remote changes and advances its state", async () => {
  const remote = await fakePodStore({
    "skills/a/SKILL.md": "a v1",
    "skills/b/SKILL.md": "b v1",
  });
  const mirrorDir = mkdtempSync(join(tmpdir(), "shared-mirror-upload-"));
  const store = new HttpObjectStore({
    baseUrl: remote.baseUrl,
    token: "pod-token",
    agentSlug: "writer",
  });
  const first = await syncSharedMirror({ store, mirrorDir });

  writeFileSync(join(mirrorDir, "skills", "a", "SKILL.md"), "a local v2");
  remote.objects.set("skills/b/SKILL.md", Buffer.from("b remote v2"));
  remote.requests.length = 0;

  const second = await syncSharedMirror({
    store,
    mirrorDir,
    state: first.state,
  });

  expect(second.uploaded).toEqual(["skills/a/SKILL.md"]);
  expect(remote.objects.get("skills/a/SKILL.md")?.toString()).toBe(
    "a local v2",
  );
  expect(
    remote.requests
      .filter((request) => request.url?.includes("/objects/"))
      .map((request) => request.method),
  ).toEqual(["PUT", "GET"]);
  expect(second.state.files["skills/a/SKILL.md"]).not.toEqual(
    first.state.files["skills/a/SKILL.md"],
  );
});

test("uploads a new local skill file", async () => {
  const remote = await fakePodStore({});
  const mirrorDir = mkdtempSync(join(tmpdir(), "shared-mirror-new-file-"));
  const store = new HttpObjectStore({
    baseUrl: remote.baseUrl,
    token: "pod-token",
    agentSlug: "writer",
  });
  const first = await syncSharedMirror({ store, mirrorDir });
  await mkdir(join(mirrorDir, "skills", "new"), { recursive: true });
  writeFileSync(join(mirrorDir, "skills", "new", "SKILL.md"), "brand new");

  const second = await syncSharedMirror({
    store,
    mirrorDir,
    state: first.state,
  });

  expect(second.uploaded).toEqual(["skills/new/SKILL.md"]);
  expect(remote.objects.get("skills/new/SKILL.md")?.toString()).toBe(
    "brand new",
  );
});

test("restores a locally deleted file instead of deleting it remotely", async () => {
  const remote = await fakePodStore({ "skills/a/SKILL.md": "keep me" });
  const mirrorDir = mkdtempSync(join(tmpdir(), "shared-mirror-delete-"));
  const store = new HttpObjectStore({
    baseUrl: remote.baseUrl,
    token: "pod-token",
    agentSlug: "writer",
  });
  const first = await syncSharedMirror({ store, mirrorDir });
  const file = join(mirrorDir, "skills", "a", "SKILL.md");
  unlinkSync(file);

  const second = await syncSharedMirror({
    store,
    mirrorDir,
    state: first.state,
  });

  expect(second.uploaded).toEqual([]);
  expect(second.downloaded).toEqual(["skills/a/SKILL.md"]);
  expect(readFileSync(file, "utf8")).toBe("keep me");
  expect(remote.objects.has("skills/a/SKILL.md")).toBe(true);
});

test("a generation conflict keeps local bytes and invokes the conflict path", async () => {
  const remote = await fakePodStore({ "skills/a/SKILL.md": "a v1" });
  const mirrorDir = mkdtempSync(join(tmpdir(), "shared-mirror-conflict-"));
  const store = new HttpObjectStore({
    baseUrl: remote.baseUrl,
    token: "pod-token",
    agentSlug: "writer",
  });
  const first = await syncSharedMirror({ store, mirrorDir });
  writeFileSync(
    join(mirrorDir, "skills", "a", "SKILL.md"),
    "intentional local edit",
  );
  remote.raceNext("skills/a/SKILL.md", "simultaneous remote edit");
  const conflicts: string[] = [];

  const second = await syncSharedMirror({
    store,
    mirrorDir,
    state: first.state,
    onConflict: (key) => conflicts.push(key),
  });

  expect(conflicts).toEqual(["skills/a/SKILL.md"]);
  expect(second.uploaded).toEqual([]);
  expect(second.downloaded).toEqual([]);
  expect(remote.objects.get("skills/a/SKILL.md")?.toString()).toBe(
    "simultaneous remote edit",
  );
  expect(readFileSync(join(mirrorDir, "skills", "a", "SKILL.md"), "utf8")).toBe(
    "intentional local edit",
  );
  expect(
    remote.requests.find((request) => request.method === "PUT")
      ?.generationMatch,
  ).toBe("1");
});

test("generation-less remote drift signals a conflict and still uploads local bytes", async () => {
  const mirrorDir = mkdtempSync(join(tmpdir(), "shared-mirror-unversioned-"));
  const key = "skills/a/SKILL.md";
  const local = Buffer.from("intentional local edit");
  const baseline = Buffer.from("shared baseline");
  const remote = Buffer.from("simultaneous remote edit");
  await mkdir(join(mirrorDir, "skills", "a"), { recursive: true });
  writeFileSync(join(mirrorDir, key), local);
  const conflicts: string[] = [];
  const preconditions: Array<string | undefined> = [];
  let uploaded = Buffer.alloc(0);

  const result = await syncSharedMirror({
    store: {
      manifest: async () => {
        throw new Error("snapshot should avoid a second manifest read");
      },
      download: async () => {
        throw new Error("push-only sync should not download");
      },
      upload: async (source, _key, opts) => {
        uploaded = readFileSync(source);
        preconditions.push(opts?.ifGenerationMatch);
      },
    },
    mirrorDir,
    snapshot: {
      state: {
        fingerprint: "remote",
        files: { [key]: { size: remote.length, md5: md5(remote) } },
      },
      objects: [
        {
          key,
          size: remote.length,
          md5: md5(remote),
          updated: "2026-07-30T00:00:00Z",
        },
      ],
    },
    state: {
      fingerprint: "baseline",
      files: { [key]: { size: baseline.length, md5: md5(baseline) } },
    },
    mode: "push-only",
    onConflict: (conflictedKey) => conflicts.push(conflictedKey),
  });

  expect(conflicts).toEqual([key]);
  expect(preconditions).toEqual([undefined]);
  expect(result.uploaded).toEqual([key]);
  expect(uploaded).toEqual(local);
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
