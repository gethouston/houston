import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  LocalDirStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import type { HarnessSession } from "../backends/types";
import { createTurnServer } from "./server";
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
      turnSessionDeps: { createModelRuntime, createBackend },
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
        provider: "openai-codex",
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
});
