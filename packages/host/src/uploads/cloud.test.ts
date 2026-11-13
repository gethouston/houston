import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HoustonEvent } from "@houston/protocol";
import {
  HttpObjectStore,
  type HydrateManifest,
  PrefetchedObjectStore,
  syncBack,
} from "@houston/runtime-client/object-sync";
import { zipSync } from "fflate";
import { expect, test } from "vitest";
import { runAgentOpChain } from "../op/handler-chain";
import { LocalPaths } from "../paths";
import { close, listen, replayHost } from "../testing/route-replay-host";
import { LazyStoreVfs } from "../vfs/lazy-store";
import { PrefixedVfs } from "../vfs/prefixed";

const uploadId = "staged_upload_123456789";
test("cloud worker copies a staged generation through both wrappers and leaves the copy outside sync-back", async () => {
  const directory = await mkdtemp(join(tmpdir(), "h1-cloud-"));
  const calls: {
    method: string;
    path: string;
    headers: typeof import("node:http").IncomingMessage.prototype.headers;
    body: unknown;
  }[] = [];
  const archive = zipSync({ "docs/migrated.txt": Buffer.from("archive") });
  const podStore = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    const body: unknown = text ? JSON.parse(text) : null;
    calls.push({
      method: req.method ?? "GET",
      path: req.url ?? "",
      headers: req.headers,
      body,
    });
    res.setHeader("content-type", "application/json");
    if (
      req.method === "POST" &&
      typeof body === "object" &&
      body !== null &&
      "key" in body
    ) {
      res.end(JSON.stringify({ key: body.key, generation: "23", size: 17 }));
    } else if (req.url?.includes(`/uploads/${uploadId}?generation=19`))
      res.end(archive);
    else {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "unexpected store call" }));
    }
  });
  const storeBase = await listen(podStore);
  const store = new HttpObjectStore({
    baseUrl: `${storeBase}/v1/pod/store/org/agent`,
    token: "pod-token",
    bootId: "boot-id",
    fence: { token: "41" },
  });
  const prefetched = new PrefetchedObjectStore(store, {
    manifest: [],
    objects: new Map(),
  });
  const manifest: HydrateManifest = new Map();
  const lazy = new LazyStoreVfs({
    store: prefetched,
    prefix: "",
    root: directory,
    objects: [],
    manifest,
    excludes: [],
    maxObjectBytes: 1000,
    maxBytes: 1000,
  });
  const vfs = new PrefixedVfs(lazy, "workspaces");
  const fixture = await replayHost();
  const workspace = await fixture.deps.store.getWorkspace(
    fixture.ids.workspaceId ?? "",
  );
  const agent = await fixture.deps.store.getAgent(fixture.ids.agentId ?? "");
  if (!workspace || !agent) throw new Error("missing fixture agent");
  agent.id = "main/agent";
  const events: HoustonEvent[] = [];
  const server = createServer((req, res) => {
    runAgentOpChain(
      {
        vfs,
        paths: new LocalPaths(),
        ctx: { workspace, agent },
        query: new URL(req.url ?? "", "http://local").searchParams,
        actingSub: "person",
        triggersEnabled: false,
        emit: (event) => events.push(event),
      },
      "POST",
      (req.url ?? "").slice(1).split("?")[0] ?? "",
      req,
      res,
    ).catch((error) => {
      res.statusCode = 500;
      res.end(String(error));
    });
  });
  const base = await listen(server);
  const post = (path: string, body: unknown) =>
    fetch(`${base}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const response = await post("attachments", {
      files: [{ name: "report.pdf", uploadId, stagedGeneration: "19" }],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ paths: ["uploads/report.pdf"] });
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/v1/pod/store/org/agent/uploads/${uploadId}/copy`,
      body: {
        key: "workspaces/main/agent/uploads/report.pdf",
        generation: "19",
      },
      headers: {
        authorization: "Bearer pod-token",
        "x-houston-boot-id": "boot-id",
        "x-houston-fencing-token": "41",
      },
    });
    expect(await vfs.exists("main/agent/uploads/report.pdf")).toBe(true);
    expect(await vfs.list("main/agent/uploads")).toEqual([
      "main/agent/uploads/report.pdf",
    ]);
    expect(await vfs.listDetailed("main/agent/uploads")).toMatchObject([
      { key: "main/agent/uploads/report.pdf", size: 17 },
    ]);
    expect(manifest.size).toBe(0);
    const synced = await syncBack(store, "", directory, manifest);
    expect(synced.uploaded).toEqual([]);
    expect(synced.deleted).toEqual([]);
    expect(calls).toHaveLength(1);
    const deduped = await post("attachments", {
      files: [{ name: "report.pdf", uploadId, stagedGeneration: "19" }],
    });
    expect(await deduped.json()).toEqual({ paths: ["uploads/report (1).pdf"] });
    expect(calls[1]?.body).toEqual({
      key: "workspaces/main/agent/uploads/report (1).pdf",
      generation: "19",
    });
    const imported = await post("files/import", {
      dir: "target",
      files: [
        {
          name: "report.pdf",
          relPath: "folder/report.pdf",
          uploadId,
          stagedGeneration: "19",
        },
      ],
    });
    expect(imported.status).toBe(200);
    expect(calls[2]?.body).toEqual({
      key: "workspaces/main/agent/target/folder/report.pdf",
      generation: "19",
    });
    expect(events).toEqual(
      Array.from({ length: 3 }, () => ({
        type: "FilesChanged",
        agentPath: agent.id,
      })),
    );
    const migration = await post("migration/import?sessions=0", {
      uploadId,
      stagedGeneration: "19",
    });
    expect(migration.status).toBe(200);
    expect(await migration.json()).toMatchObject({ written: 1, rejected: [] });
    expect(calls[3]).toMatchObject({
      method: "GET",
      path: `/v1/pod/store/org/agent/uploads/${uploadId}?generation=19`,
      headers: { authorization: "Bearer pod-token" },
    });
    expect(await vfs.readText("main/agent/docs/migrated.txt")).toBe("archive");
  } finally {
    await close(server);
    await close(podStore);
    await rm(directory, { recursive: true, force: true });
  }
});
