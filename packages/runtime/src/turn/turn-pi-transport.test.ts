import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { HoustonAuthStore } from "../auth/credential-store";
import { createPiBackend } from "../backends/pi/backend";
import { createTurnBackend } from "./turn-backend";
import { turnTitleRunner } from "./turn-mission-title";

async function fauxWorld() {
  const turnRoot = mkdtempSync(join(tmpdir(), "turn-pi-transport-"));
  const workspaceDir = join(turnRoot, "workspace");
  const dataDir = join(turnRoot, "data");
  mkdirSync(workspaceDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    join(dataDir, "settings.json"),
    JSON.stringify({ retry: { provider: { maxRetries: 7 } } }),
  );
  const seen: SimpleStreamOptions[] = [];
  const faux = fauxProvider({
    provider: "faux",
    api: "faux",
    models: [{ id: "faux-1", contextWindow: 200000, maxTokens: 8192 }],
  });
  const reply = (_context: unknown, options?: SimpleStreamOptions) => {
    seen.push(options ?? {});
    return fauxAssistantMessage("A title", { stopReason: "stop" });
  };
  faux.setResponses([reply, reply]);
  const credentials = new HoustonAuthStore(join(dataDir, "auth.json"));
  credentials.set("faux", { type: "api_key", key: "faux-key" });
  const modelRuntime = await ModelRuntime.create({
    credentials,
    modelsPath: join(dataDir, "models.json"),
  });
  modelRuntime.registerNativeProvider(faux.provider);
  const directories = { workspaceDir, dataDir, turnRoot };
  return { directories, modelRuntime, model: faux.getModel(), seen };
}

test("a pooled turn's pi session and its title one-shot both request over SSE", async () => {
  const world = await fauxWorld();
  const backend = createTurnBackend("faux", {
    directories: world.directories,
    turn: {
      conversationId: "c1",
      text: "hello",
      provider: "faux",
      emit: () => undefined,
      signal: undefined,
      turnId: "t1",
    },
    modelRuntime: world.modelRuntime,
    toolSelection: { toolNames: [], includeRunCode: false },
    codeSandbox: null,
    systemPrompt: "system",
  });
  const session = await backend.createSession({
    conversationId: "c1",
    model: world.model,
  });
  await session.prompt("hello");
  session.dispose();
  const title = turnTitleRunner({
    provider: "faux",
    model: world.model,
    modelRuntime: world.modelRuntime,
    directories: world.directories,
  });
  expect(await title("hello", new AbortController().signal)).toBe("A title");

  expect(world.seen.map((options) => options.transport)).toEqual([
    "sse",
    "sse",
  ]);
  expect(world.seen[0]?.maxRetries).toBe(7);
});

test("a pi backend that names no transport keeps pi's own auto", async () => {
  const world = await fauxWorld();
  const backend = createPiBackend({
    workspaceDir: world.directories.workspaceDir,
    dataDir: world.directories.dataDir,
    modelRuntime: world.modelRuntime,
    tools: [],
    customTools: [],
  });
  const session = await backend.createSession({
    conversationId: "c1",
    model: world.model,
  });
  await session.prompt("hello");
  session.dispose();

  expect(world.seen.map((options) => options.transport)).toEqual(["auto"]);
  expect(world.seen[0]?.maxRetries).toBe(7);
});
