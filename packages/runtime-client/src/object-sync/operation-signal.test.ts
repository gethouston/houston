import { getEventListeners } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { HttpObjectStore } from "./http-store";
import { withOperationSignal } from "./operation-signal";

const abortListeners = (signal: AbortSignal) =>
  getEventListeners(signal, "abort").length;

test("the operation's signal follows an abort of the parent", async () => {
  const parent = new AbortController();
  const reason = new Error("stop hydration");
  const running = withOperationSignal(
    parent.signal,
    (own) =>
      new Promise((_resolve, reject) => {
        own?.addEventListener("abort", () => reject(own.reason), {
          once: true,
        });
      }),
  );
  parent.abort(reason);
  await expect(running).rejects.toBe(reason);
  expect(abortListeners(parent.signal)).toBe(0);
});

test("the parent loses its listener when the operation fails", async () => {
  const parent = new AbortController();
  await expect(
    withOperationSignal(parent.signal, async () => {
      throw new Error("store said no");
    }),
  ).rejects.toThrow("store said no");
  expect(abortListeners(parent.signal)).toBe(0);
});

test("no parent, or an aborted one, passes through unchanged", async () => {
  expect(await withOperationSignal(undefined, async (own) => own)).toBe(
    undefined,
  );
  const aborted = AbortSignal.abort(new Error("already gone"));
  expect(await withOperationSignal(aborted, async (own) => own)).toBe(aborted);
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      if (request.url?.endsWith("/manifest")) {
        response.setHeader("content-type", "application/json");
        response.end('{"objects":[]}');
      } else if (request.url?.endsWith("/batch")) {
        response.writeHead(405).end();
      } else if (request.method === "PUT") {
        response.setHeader("content-type", "application/json");
        response.end(
          '{"key":"k","size":2,"md5":"m","updated":"2026-10-02T00:00:00Z"}',
        );
      } else {
        response.end("ok");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

test("hundreds of store calls sharing one signal leave no listeners on it", async () => {
  const store = new HttpObjectStore({
    baseUrl,
    token: "pod-token",
    batchReads: true,
  });
  const dir = mkdtempSync(join(tmpdir(), "operation-signal-"));
  const source = join(dir, "up.json");
  writeFileSync(source, "{}");
  const parent = new AbortController();
  const signal = parent.signal;

  for (let index = 0; index < 300; index += 1) {
    await store.download(`file-${index}.txt`, join(dir, `${index}.txt`), {
      signal,
    });
  }
  await store.manifest("", { signal });
  await store.downloadMany?.([{ key: "a.txt", destFile: join(dir, "a.txt") }], {
    signal,
  });
  await store.upload(source, "up.json", { signal });

  expect(abortListeners(signal)).toBe(0);
});
