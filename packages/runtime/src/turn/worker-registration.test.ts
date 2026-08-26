import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import { AdmissionLimiter } from "./admission";
import { createTurnServer } from "./server";
import { beginWorkerShutdown, WorkerRegistration } from "./worker-registration";
import {
  loadWorkerRegistrationConfig,
  turnServerToken,
} from "./worker-registration-config";

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

test("registration is off when every variable is absent", async () => {
  await expect(loadWorkerRegistrationConfig({})).resolves.toBeNull();
});

test("partial registration fails with every missing variable", async () => {
  await expect(
    loadWorkerRegistrationConfig({ HOUSTON_POOL_WORKER_ID: "worker-1" }),
  ).rejects.toThrow(
    "HOUSTON_POOL_REGISTER_URL, HOUSTON_POOL_WORKER_TOKEN_FILE, HOUSTON_POOL_ENDPOINT",
  );
});

test("registration loads this worker's token from its single file and dev token wins", async () => {
  const tokenDir = await mkdtemp(join(tmpdir(), "worker-token-"));
  await mkdir(tokenDir, { recursive: true });
  // The pod projects ONLY its own ordinal as one file (subPathExpr); the
  // runtime reads that file, never a directory of every worker's token.
  const tokenFile = join(tokenDir, "token");
  await writeFile(tokenFile, " pool-token\n");
  const config = await loadWorkerRegistrationConfig({
    HOUSTON_POOL_REGISTER_URL: "https://gateway.test/",
    HOUSTON_POOL_WORKER_ID: "worker-1",
    HOUSTON_POOL_WORKER_TOKEN_FILE: tokenFile,
    HOUSTON_POOL_ENDPOINT: "http://worker-1:4318",
    HOUSTON_POOL_POD_UID: "pod-1",
    HOUSTON_POOL_SINGLE_USE: "1",
  });

  expect(config).toMatchObject({
    heartbeatUrl: "https://gateway.test/v1/pool/workers/heartbeat",
    workerId: "worker-1",
    endpoint: "http://worker-1:4318",
    token: "pool-token",
    podUid: "pod-1",
    singleUse: true,
  });
  expect(turnServerToken("dev-token", config)).toBe("dev-token");
  expect(turnServerToken("", config)).toBe("pool-token");
});

test("the selected token protects the inbound turn route", async () => {
  const registration = {
    heartbeatUrl: "https://gateway.test/heartbeat",
    workerId: "worker-1",
    endpoint: "http://worker-1:4318",
    token: "pool-token",
    podUid: "pod-1",
    singleUse: true,
  };
  const startServer = async (explicitToken: string) => {
    const server = createTurnServer({
      store: new LocalDirStore(await mkdtemp(join(tmpdir(), "token-store-"))),
      token: turnServerToken(explicitToken, registration),
      isDraining: () => true,
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    return `http://127.0.0.1:${address.port}`;
  };
  const post = (base: string, token: string) =>
    fetch(`${base}/turn`, {
      method: "POST",
      headers: { "x-internal-token": token },
    });

  const pooled = await startServer("");
  expect((await post(pooled, "wrong")).status).toBe(401);
  expect((await post(pooled, "pool-token")).status).toBe(503);
  const development = await startServer("dev-token");
  expect((await post(development, "pool-token")).status).toBe(401);
  expect((await post(development, "dev-token")).status).toBe(503);
});

test("heartbeat sends the exact body and bearer token", async () => {
  let received:
    | { authorization?: string; body: Record<string, unknown> }
    | undefined;
  const gateway = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      received = {
        authorization: req.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      };
      res.writeHead(204).end();
    })();
  });
  servers.push(gateway);
  await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  const address = gateway.address();
  if (!address || typeof address === "string") throw new Error("no address");
  const admission = new AdmissionLimiter(3);
  const release = admission.tryAcquire();
  const registration = new WorkerRegistration(
    {
      heartbeatUrl: `http://127.0.0.1:${address.port}/v1/pool/workers/heartbeat`,
      workerId: "worker-1",
      endpoint: "http://worker-1:4318",
      token: "worker-token",
      podUid: "pod-1",
      singleUse: true,
    },
    admission,
    { bootId: "boot-1", intervalMs: 60_000 },
  );

  await registration.start();
  await registration.stop();
  release?.();

  expect(received).toEqual({
    authorization: "Bearer worker-token",
    body: {
      workerId: "worker-1",
      bootId: "boot-1",
      endpoint: "http://worker-1:4318",
      capacity: 3,
      activeClaims: 1,
      draining: false,
      podUid: "pod-1",
      singleUse: true,
    },
  });
});

test("a failed heartbeat logs status and text, then retries", async () => {
  let calls = 0;
  const messages: string[] = [];
  const registration = new WorkerRegistration(
    {
      heartbeatUrl: "https://gateway.test/heartbeat",
      workerId: "worker-1",
      endpoint: "http://worker-1:4318",
      token: "worker-token",
      podUid: "pod-1",
      singleUse: true,
    },
    new AdmissionLimiter(1),
    {
      bootId: "boot-1",
      intervalMs: 5,
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? new Response("try later", { status: 503 })
          : new Response(null, { status: 204 });
      },
      log: (message) => messages.push(message),
    },
  );

  await registration.start();
  expect(calls).toBe(2);
  await registration.stop();
  expect(messages[0]).toContain("(503): try later");
});

test("stop aborts an in-flight heartbeat", async () => {
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const registration = new WorkerRegistration(
    {
      heartbeatUrl: "https://gateway.test/heartbeat",
      workerId: "worker-1",
      endpoint: "http://worker-1:4318",
      token: "worker-token",
      podUid: "pod-1",
      singleUse: true,
    },
    new AdmissionLimiter(1),
    {
      bootId: "boot-1",
      fetchImpl: async (_input, init) => {
        markStarted?.();
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        });
      },
    },
  );

  const starting = registration.start();
  await started;
  await registration.stop();
  await expect(starting).rejects.toThrow(
    "worker registration stopped before first success",
  );
});

test("SIGTERM flips draining and admission reports worker_draining", async () => {
  const admission = new AdmissionLimiter(1);
  const bodies: Array<Record<string, unknown>> = [];
  const registration = new WorkerRegistration(
    {
      heartbeatUrl: "https://gateway.test/heartbeat",
      workerId: "worker-1",
      endpoint: "http://worker-1:4318",
      token: "worker-token",
      podUid: "pod-1",
      singleUse: true,
    },
    admission,
    {
      bootId: "boot-1",
      fetchImpl: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      },
    },
  );

  await beginWorkerShutdown("SIGTERM", registration);
  expect(registration.draining).toBe(true);
  expect(bodies.at(-1)).toMatchObject({ draining: true });
  const server = createTurnServer({
    store: new LocalDirStore(await mkdtemp(join(tmpdir(), "drain-store-"))),
    token: "",
    admission,
    isDraining: () => registration.draining,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  const response = await fetch(`http://127.0.0.1:${address.port}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "worker_draining" });
});
