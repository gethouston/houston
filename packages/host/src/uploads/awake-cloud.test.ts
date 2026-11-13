import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpObjectStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { createHostFiles } from "../local/host-files";
import { close, listen } from "../testing/route-replay-host";
import { saveAttachments } from "../turn/attachments";
import { stagedUploads } from "./commit";

test("awake cloud hosts materialize a copied upload and sync never uploads it again or deletes it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "h1-awake-"));
  const requests: string[] = [];
  const downloading = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const bytes = Buffer.from("copied content");
  const podStore = createServer(async (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    const parts: Buffer[] = [];
    for await (const part of req) parts.push(part);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/manifest") {
      res.end(JSON.stringify({ objects: [] }));
      return;
    }
    if (req.url === "/uploads/opaque_upload_id_123/copy") {
      expect(req.headers["x-houston-fencing-token"]).toBe("41");
      expect(JSON.parse(Buffer.concat(parts).toString())).toEqual({
        key: "workspaces/main/agent/uploads/report.txt",
        generation: "19",
      });
      res.end(
        JSON.stringify({
          key: "workspaces/main/agent/uploads/report.txt",
          generation: "23",
          size: bytes.length,
        }),
      );
      return;
    }
    if (
      req.method === "GET" &&
      req.url === "/objects/workspaces/main/agent/uploads/report.txt"
    ) {
      downloading.resolve();
      await release.promise;
      res.setHeader("X-Houston-Generation", "23");
      res.end(bytes);
      return;
    }
    res.statusCode = 500;
    res.end("unexpected store call");
  });
  const url = await listen(podStore);
  const store = new HttpObjectStore({
    baseUrl: url,
    token: "pod",
    bootId: "boot",
    fence: { token: "41" },
  });
  const { vfs, syncDaemon } = createHostFiles({
    workspacesRoot: join(directory, "workspaces"),
    houstonHome: directory,
    credentialsPath: join(directory, "credentials.json"),
    port: 0,
    token: "local",
    runtimeCommand: [],
    storeSync: { store, generations: true },
  });
  if (!syncDaemon) throw new Error("missing sync daemon");
  try {
    await syncDaemon.hydrate();
    await mkdir(join(directory, "upload-staging"), { recursive: true });
    await writeFile(
      join(directory, "upload-staging", "opaque_upload_id_123.part"),
      "partial",
    );
    const saving = saveAttachments(
      vfs,
      "main/agent",
      [
        {
          name: "report.txt",
          uploadId: "opaque_upload_id_123",
          stagedGeneration: "19",
        },
      ],
      stagedUploads(undefined, vfs, {
        owner: "person",
        agentId: "main/agent",
        workspace: "main",
        purpose: "attachment",
      }),
    );
    await downloading.promise;
    // A final sync joins the copy's transaction before walking the new file.
    const stopped = syncDaemon.stop();
    release.resolve();
    expect(await saving).toEqual(["uploads/report.txt"]);
    await stopped;
    expect(
      await readFile(
        join(directory, "workspaces/main/agent/uploads/report.txt"),
      ),
    ).toEqual(bytes);
    expect(await vfs.exists("main/agent/uploads/report.txt")).toBe(true);
    expect(requests).toEqual([
      "GET /manifest",
      "POST /uploads/opaque_upload_id_123/copy",
      "GET /objects/workspaces/main/agent/uploads/report.txt",
    ]);
  } finally {
    release.resolve();
    await syncDaemon.stop();
    await close(podStore);
    await rm(directory, { recursive: true, force: true });
  }
});
