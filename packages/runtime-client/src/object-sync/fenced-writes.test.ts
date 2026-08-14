import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { HttpObjectStore } from "./http-store";
import { hydrate, syncBack } from "./hydrate";
import { StoreFencedError } from "./object-store";

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

async function fakeFencedPodStore() {
  let body = Buffer.from("remote v1");
  let generation = 1;
  let fencingToken = "10";
  let adoptedBootId: string | undefined;
  const writes: Array<{
    bootId?: string;
    fencingToken?: string;
    generationMatch?: string;
  }> = [];
  const metadata = () => ({
    key: "notes.txt",
    size: body.length,
    md5: "md5",
    updated: "2026-08-12T00:00:00Z",
    gen: String(generation),
  });
  const server = createServer((req, res) => {
    res.setHeader("X-Houston-Fencing-Token", fencingToken);
    const url = new URL(req.url ?? "/", "http://pod-store");
    if (url.pathname.endsWith("/manifest")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ objects: [metadata()] }));
      return;
    }
    if (req.method !== "PUT") {
      res.setHeader("X-Houston-Generation", String(generation));
      res.end(body);
      return;
    }
    const request = {
      bootId: req.headers["x-houston-boot-id"] as string | undefined,
      fencingToken: req.headers["x-houston-fencing-token"] as
        | string
        | undefined,
      generationMatch: req.headers["x-houston-if-generation-match"] as
        | string
        | undefined,
    };
    writes.push(request);
    if (
      request.fencingToken !== fencingToken ||
      !request.bootId ||
      (adoptedBootId !== undefined && request.bootId !== adoptedBootId)
    ) {
      res.writeHead(409);
      res.end("fenced");
      return;
    }
    adoptedBootId ??= request.bootId;
    if (request.generationMatch !== String(generation)) {
      res.writeHead(412);
      res.end("generation conflict");
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      body = Buffer.concat(chunks);
      generation += 1;
      res.setHeader("content-type", "application/json");
      res.setHeader("X-Houston-Generation", String(generation));
      res.end(JSON.stringify(metadata()));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1/pod/store/acme/agent`,
    body: () => body,
    takeover() {
      fencingToken = "11";
      adoptedBootId = undefined;
    },
    writes,
  };
}

test("hydrate captures the lease and a takeover fences the next sync write", async () => {
  const remote = await fakeFencedPodStore();
  const local = mkdtempSync(join(tmpdir(), "fenced-pod-store-"));
  const store = new HttpObjectStore({
    baseUrl: remote.baseUrl,
    token: "pod-token",
    bootId: "boot-a",
    fence: {},
    retryDelaysMs: [],
  });

  const hydrated = await hydrate(store, "", local);
  expect(readFileSync(join(local, "notes.txt"), "utf8")).toBe("remote v1");
  expect(hydrated.get("notes.txt")?.generation).toBe("1");

  writeFileSync(join(local, "notes.txt"), "local v2");
  const first = await syncBack(store, "", local, hydrated);
  expect(remote.body().toString()).toBe("local v2");
  expect(remote.writes[0]).toEqual({
    bootId: "boot-a",
    fencingToken: "10",
    generationMatch: "1",
  });

  remote.takeover();
  writeFileSync(join(local, "notes.txt"), "stale pod v3");
  await expect(
    syncBack(store, "", local, first.manifest),
  ).rejects.toBeInstanceOf(StoreFencedError);
  expect(remote.writes[1]).toEqual({
    bootId: "boot-a",
    fencingToken: "10",
    generationMatch: "2",
  });
  expect(remote.body().toString()).toBe("local v2");
});
