import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  LocalDirStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";
import { createTurnServer } from "./server";
import type { TurnServerDeps } from "./server-types";
import type { RunTurnDeps } from "./turn-session";

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

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return `http://127.0.0.1:${address.port}`;
}

async function seed(root: string, rel: string, content: string): Promise<void> {
  const path = join(root, ...rel.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

test("turn setup overlaps hydration but prompt waits for the complete tree", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-overlap-store-"));
  const prefix = "ws/w1/agent-1";
  await seed(storeRoot, `${prefix}/data/settings.json`, "{}");
  await seed(storeRoot, `${prefix}/workspace/late.txt`, "fully hydrated");
  const inner = new LocalDirStore(storeRoot);
  const downloadStarted = deferred();
  const releaseDownload = deferred();
  const store: ObjectStore = {
    list: (listedPrefix) => inner.list(listedPrefix),
    manifest: (listedPrefix) => inner.manifest(listedPrefix),
    download: async (key, destination) => {
      if (key.endsWith("workspace/late.txt")) {
        downloadStarted.resolve();
        await releaseDownload.promise;
      }
      await inner.download(key, destination);
    },
    upload: (source, key, options) => inner.upload(source, key, options),
    delete: (key, options) => inner.delete(key, options),
  };
  const startupBegan = deferred();
  const backendBuilt = deferred();
  let prompted = false;
  let promptSaw = "";
  let startupSaw = "";
  let hydratedWorkspace = "";
  const session: HarnessSession = {
    subscribe: () => () => undefined,
    prompt: async () => {
      prompted = true;
      promptSaw = await readFile(join(hydratedWorkspace, "late.txt"), "utf8");
    },
    abort: async () => undefined,
    dispose: () => undefined,
    setModel: async () => undefined,
    compact: async () => undefined,
    setThinkingLevel: () => undefined,
    getContextUsage: () => undefined,
  };
  const createModelRuntime: NonNullable<
    RunTurnDeps["createModelRuntime"]
  > = async (dataDir) => {
    startupSaw = await readFile(join(dataDir, "settings.json"), "utf8");
    startupBegan.resolve();
    return {
      modelRuntime: {} as ModelRuntime,
      model: {
        provider: "openai-codex",
        id: "gpt-test",
        contextWindow: 128_000,
      } as unknown as Model<Api>,
    };
  };
  const createBackend: NonNullable<RunTurnDeps["createBackend"]> = (
    _provider,
    input,
  ) => {
    hydratedWorkspace = input.directories.workspaceDir;
    backendBuilt.resolve();
    return { id: "pi", createSession: async () => session };
  };
  const base = await listen(
    createTurnServer({
      store,
      token: "",
      turnSessionDeps: {
        createModelRuntime,
        createBackend,
        claudeSdk: {} as NonNullable<RunTurnDeps["claudeSdk"]>,
      },
    }),
  );

  const response = fetch(`${base}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "w1",
      agentId: "agent-1",
      conversationId: "c1",
      text: "hello",
      gcsPrefix: prefix,
      credential: {
        provider: "anthropic",
        access: "access-token",
        expires: Date.now() + 60_000,
      },
    }),
  });

  await downloadStarted.promise;
  await startupBegan.promise;
  await backendBuilt.promise;
  expect(prompted).toBe(false);
  expect(startupSaw).toBe("{}");
  releaseDownload.resolve();
  const body = await (await response).text();

  expect(body).toContain('"type":"done"');
  expect(prompted).toBe(true);
  expect(promptSaw).toBe("fully hydrated");
  expect(body).toContain('"listing"');
  expect(body).toContain('"layout"');
  expect(body).toContain('"startup_files"');
  expect(body).toContain('"backend_created"');
  expect(body).toContain('"hydrated"');
  const done = body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map(
      (line) =>
        JSON.parse(line.slice(6)) as {
          type: string;
          data?: { timingsMs?: Record<string, number> };
        },
    )
    .find((frame) => frame.type === "done");
  const phase = done?.data?.timingsMs;
  expect(phase?.backend_loaded).toBeLessThanOrEqual(
    phase?.backend_created ?? -1,
  );
  expect(phase?.backend_created).toBeLessThanOrEqual(phase?.run_done ?? -1);
});

test("credential failure waits for hydration before removing the turn root", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-overlap-failure-"));
  const prefix = "ws/w1/agent-1";
  await seed(storeRoot, `${prefix}/data/settings.json`, "{}");
  await seed(storeRoot, `${prefix}/workspace/late.txt`, "late bytes");
  const inner = new LocalDirStore(storeRoot);
  const downloadStarted = deferred();
  const releaseDownload = deferred();
  let downloadInFlight = false;
  let downloadSettled = false;
  let turnRoot = "";
  const store: ObjectStore = {
    list: (listedPrefix) => inner.list(listedPrefix),
    manifest: (listedPrefix) => inner.manifest(listedPrefix),
    download: async (key, destination) => {
      if (!key.endsWith("workspace/late.txt")) {
        return inner.download(key, destination);
      }
      turnRoot = dirname(dirname(dirname(destination)));
      downloadInFlight = true;
      downloadStarted.resolve();
      await releaseDownload.promise;
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, "late bytes");
      downloadInFlight = false;
      downloadSettled = true;
      throw new Error("late hydration failed");
    },
    upload: (source, key, options) => inner.upload(source, key, options),
    delete: (key, options) => inner.delete(key, options),
  };
  let removeCalls = 0;
  const deps = {
    store,
    token: "",
    runTurn: async () => ({}),
    writeTurnCredential: () => {
      expect(downloadInFlight).toBe(true);
      throw new Error("ENOSPC credential write");
    },
    removeTurnRoot: async (root: string) => {
      removeCalls += 1;
      expect(downloadSettled).toBe(true);
      await rm(root, { recursive: true, force: true });
    },
  } as TurnServerDeps & {
    writeTurnCredential: () => never;
    removeTurnRoot: (root: string) => Promise<void>;
  };
  const base = await listen(createTurnServer(deps));
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const response = fetch(`${base}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: "w1",
        agentId: "agent-1",
        conversationId: "c1",
        text: "hello",
        gcsPrefix: prefix,
        credential: {
          provider: "openai-codex",
          access: "access-token",
          expires: Date.now() + 60_000,
        },
      }),
    });
    await downloadStarted.promise;
    expect(removeCalls).toBe(0);
    releaseDownload.resolve();
    const body = await (await response).text();
    expect(body.match(/"type":"error"/g)).toHaveLength(1);
    expect(body).toContain("credential_write_failed");
    expect(removeCalls).toBe(1);
    expect(existsSync(turnRoot)).toBe(false);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(existsSync(turnRoot)).toBe(false);
    expect(unhandled).toEqual([]);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("hydration failure reports an abandoned startup failure", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-startup-failure-"));
  const prefix = "ws/w1/agent-1";
  await seed(storeRoot, `${prefix}/data/settings.json`, "{}");
  await seed(storeRoot, `${prefix}/workspace/late.txt`, "late");
  const inner = new LocalDirStore(storeRoot);
  const store: ObjectStore = {
    list: (listedPrefix) => inner.list(listedPrefix),
    manifest: (listedPrefix) => inner.manifest(listedPrefix),
    download: async (key, destination) => {
      if (key.endsWith("workspace/late.txt")) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        throw new Error("hydration failed");
      }
      await inner.download(key, destination);
    },
    upload: (source, key, options) => inner.upload(source, key, options),
    delete: (key, options) => inner.delete(key, options),
  };
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  const base = await listen(
    createTurnServer({
      store,
      token: "",
      turnSessionDeps: {
        createModelRuntime: async () => {
          throw new Error("startup failed");
        },
      },
    }),
  );
  try {
    await fetch(`${base}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: "w1",
        agentId: "agent-1",
        conversationId: "c1",
        text: "hello",
        gcsPrefix: prefix,
        credential: {
          provider: "openai-codex",
          access: "access-token",
          expires: Date.now() + 60_000,
        },
      }),
    });
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("[turn] overlapped startup failed"),
    );
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("startup failed"),
    );
  } finally {
    errorLog.mockRestore();
  }
});

test("routine fallback uses injected turn session dependencies", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-routine-deps-"));
  const prefix = "ws/w1/agent-1";
  await seed(storeRoot, `${prefix}/data/settings.json`, "{}");
  await seed(
    storeRoot,
    `${prefix}/workspace/.houston/routines/routines.json`,
    JSON.stringify([
      {
        id: "daily-check",
        name: "Daily check",
        prompt: "Check the queue.",
        schedule: "0 9 * * *",
        enabled: true,
        provider: "openai-codex",
      },
    ]),
  );
  const inner = new LocalDirStore(storeRoot);
  let backendCalls = 0;
  const session: HarnessSession = {
    subscribe: () => () => undefined,
    prompt: async () => undefined,
    abort: async () => undefined,
    dispose: () => undefined,
    setModel: async () => undefined,
    compact: async () => undefined,
    setThinkingLevel: () => undefined,
    getContextUsage: () => undefined,
  };
  const base = await listen(
    createTurnServer({
      store: inner,
      token: "",
      fetchImpl: async () => new Response(null, { status: 200 }),
      turnSessionDeps: {
        createModelRuntime: async () => ({
          modelRuntime: {} as ModelRuntime,
          model: {
            provider: "openai-codex",
            id: "gpt-test",
            contextWindow: 128_000,
          } as unknown as Model<Api>,
        }),
        createBackend: () => {
          backendCalls += 1;
          return { id: "pi", createSession: async () => session };
        },
      },
    }),
  );
  const response = await fetch(`${base}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "w1",
      agentId: "agent-1",
      conversationId: "routine-daily-check",
      text: "",
      gcsPrefix: prefix,
      hostToken: "host-token",
      claim: {
        id: "claim-1",
        bootId: "boot-1",
        token: "claim-token",
        heartbeatUrl: "https://gateway.test/heartbeat",
      },
      routine: { id: "daily-check" },
      credential: {
        provider: "openai-codex",
        access: "access-token",
        expires: Date.now() + 60_000,
      },
    }),
  });
  expect(await response.text()).toContain('"type":"done"');
  expect(backendCalls).toBe(1);
});
