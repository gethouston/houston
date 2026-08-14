import { mkdtempSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { buildLocalHost } from "./host";

async function healthBody(storeSync?: {
  store: ObjectStore;
}): Promise<unknown> {
  const root = mkdtempSync(join(tmpdir(), "host-health-"));
  const host = buildLocalHost({
    workspacesRoot: join(root, "workspaces"),
    credentialsPath: join(root, "credentials.json"),
    port: 0,
    token: "test-token",
    runtimeCommand: ["true"],
    storeSync,
  });
  return new Promise((resolve, reject) => {
    const req = { method: "GET", url: "/health" } as IncomingMessage;
    let status = 0;
    const res = {
      setHeader() {},
      writeHead(nextStatus: number) {
        status = nextStatus;
      },
      end(body: Buffer) {
        try {
          expect(status).toBe(200);
          resolve(JSON.parse(body.toString("utf8")));
        } catch (error) {
          reject(error);
        }
      },
    } as unknown as ServerResponse;
    host.server.emit("request", req, res);
  });
}

const store: ObjectStore = {
  async list() {
    return [];
  },
  async download() {},
  async upload() {},
  async delete() {},
};

test("local host wires the managed daemon fence getter into health", async () => {
  await expect(healthBody({ store })).resolves.toEqual({
    status: "ok",
    storeFenced: false,
  });
});

test("local host omits the managed fence field on desktop", async () => {
  await expect(healthBody()).resolves.toEqual({ status: "ok" });
});
