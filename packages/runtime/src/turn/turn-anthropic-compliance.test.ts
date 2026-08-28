import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import type {
  createSdkMcpServer,
  Options,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ClaudeQuery } from "../backends/claude/session";

const pi = vi.hoisted(() => ({
  createBackend: vi.fn(),
}));
vi.mock("../backends/pi/backend", async () => {
  const actual = await vi.importActual<typeof import("../backends/pi/backend")>(
    "../backends/pi/backend",
  );
  return {
    ...actual,
    createPiBackend: (
      ...args: Parameters<typeof actual.createPiBackend>
    ): ReturnType<typeof actual.createPiBackend> => {
      pi.createBackend();
      return actual.createPiBackend(...args);
    },
  };
});

const scratch = mkdtempSync(join(tmpdir(), "anthropic-compliance-"));
process.env.HOUSTON_MODE = "turn";
process.env.HOUSTON_DATA_DIR = join(scratch, "process-data");
process.env.HOUSTON_WORKSPACE_DIR = join(scratch, "process-workspace");
process.env.HOUSTON_CODE_EXECUTION = "disabled";

const [{ createTurnServer }, { runTurn }] = await Promise.all([
  import("./server"),
  import("./turn-session"),
]);

const storeRoot = join(scratch, "store");
const store = new LocalDirStore(storeRoot);
const servers: Server[] = [];

beforeEach(() => {
  pi.createBackend.mockClear();
});

function listen(server: Server): Promise<string> {
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("server did not bind a TCP port"));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function seed(prefix: string, rel: string, content: string): void {
  const path = join(storeRoot, ...prefix.split("/"), ...rel.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function fakeMcp() {
  return ((input: { name: string }) => ({
    type: "sdk",
    name: input.name,
    instance: {},
  })) as typeof createSdkMcpServer;
}

const HOST_SECRETS = [
  "HOUSTON_POOL_WORKER_TOKEN",
  "HOUSTON_SANDBOX_TOKEN",
  "HOUSTON_TURN_TOKEN",
  "HOUSTON_RUNTIME_TOKEN",
  "HOUSTON_POOL_STORE_URL",
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  pi.createBackend.mockClear();
  for (const key of HOST_SECRETS) delete process.env[key];
});

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

test.each([
  {
    kind: "oauth" as const,
    access: "sk-ant-oat01-compliance",
    envKey: "CLAUDE_CODE_OAUTH_TOKEN",
  },
  {
    kind: "api_key" as const,
    access: "sk-ant-api03-compliance",
    envKey: "ANTHROPIC_API_KEY",
  },
])("$kind Anthropic turn stays inside the Claude SDK boundary", async (input) => {
  const prefix = `ws/compliance/${input.kind}`;
  const conversationId = `conversation-${input.kind}`;
  seed(prefix, "data/settings.json", "{}");
  for (const key of HOST_SECRETS) process.env[key] = `secret-${key}`;

  const originalFetch = globalThis.fetch;
  const fetchGuard = vi.fn<typeof fetch>(async (request, init) => {
    const url = new URL(
      typeof request === "string" || request instanceof URL
        ? request
        : request.url,
    );
    if (url.hostname === "api.anthropic.com")
      throw new Error("Anthropic was dialed outside the Claude SDK seam");
    return originalFetch(request, init);
  });
  vi.stubGlobal("fetch", fetchGuard);

  const originalConnect = net.connect;
  const dialedHosts: string[] = [];
  vi.spyOn(net, "connect").mockImplementation(((...args: unknown[]) => {
    const first = args[0];
    const host =
      typeof first === "object" && first !== null && "host" in first
        ? String(first.host)
        : typeof args[1] === "string"
          ? args[1]
          : "";
    dialedHosts.push(host);
    if (host === "api.anthropic.com")
      throw new Error("Anthropic was dialed through node:net");
    return Reflect.apply(originalConnect, net, args) as ReturnType<
      typeof net.connect
    >;
  }) as typeof net.connect);

  let queryCalls = 0;
  let capturedOptions: Options | undefined;
  const query: ClaudeQuery = async function* ({ options }) {
    queryCalls += 1;
    capturedOptions = options;
    const configDir = options.env?.CLAUDE_CONFIG_DIR;
    if (!configDir) throw new Error("query received no Claude config dir");
    const transcript = join(
      configDir,
      "projects",
      "foreign-slug",
      `${input.kind}-session.jsonl`,
    );
    mkdirSync(dirname(transcript), { recursive: true });
    writeFileSync(transcript, '{"type":"user"}\n');
    mkdirSync(join(configDir, "statsig"), { recursive: true });
    writeFileSync(join(configDir, "statsig", "cache.json"), "cache");
    writeFileSync(join(configDir, ".credentials.json"), "credential-cache");
    yield {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: `sdk-${input.kind}-reply` },
      },
      session_id: `${input.kind}-session`,
      parent_tool_use_id: null,
    } as unknown as SDKMessage;
    yield {
      type: "result",
      subtype: "success",
      usage: { input_tokens: 12, output_tokens: 3 },
      session_id: `${input.kind}-session`,
    } as unknown as SDKMessage;
  };
  const runtime = createTurnServer({
    store,
    token: "",
    poolStoreUrl: "",
    runTurn: (directories, turn) =>
      runTurn(directories, turn, {
        claudeSdk: { query, createSdkMcpServer: fakeMcp() },
      }),
    fetchImpl: async () => new Response(null, { status: 204 }),
  });
  const runtimeUrl = await listen(runtime);
  const response = await fetch(`${runtimeUrl}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "compliance",
      agentId: input.kind,
      conversationId,
      text: "hello",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      gcsPrefix: prefix,
      hostToken: "host-token",
      claim: {
        id: `claim-${input.kind}`,
        bootId: "boot-compliance",
        token: "claim-token",
        heartbeatUrl: "https://gateway.invalid/heartbeat",
      },
      credential: {
        provider: "anthropic",
        access: input.access,
        expires: Date.now() + 60_000,
        kind: input.kind,
      },
    }),
  });
  const stream = await response.text();
  expect(response.status, stream).toBe(200);

  expect(stream).toContain(`sdk-${input.kind}-reply`);
  expect(queryCalls).toBe(1);
  expect(pi.createBackend).not.toHaveBeenCalled();
  expect(dialedHosts).not.toContain("api.anthropic.com");
  expect(
    fetchGuard.mock.calls.some(([request]) => {
      const value =
        typeof request === "string" || request instanceof URL
          ? String(request)
          : request.url;
      return new URL(value).hostname === "api.anthropic.com";
    }),
  ).toBe(false);

  const env = capturedOptions?.env;
  expect(env?.[input.envKey]).toBe(input.access);
  expect(env?.CLAUDE_CONFIG_DIR).toContain(
    `/data/sessions/${conversationId}/claude`,
  );
  expect(env?.CLAUDE_SECURESTORAGE_CONFIG_DIR).not.toContain("/store/");
  expect(env?.HOME).not.toContain("/store/");
  for (const key of HOST_SECRETS) expect(env?.[key]).toBeUndefined();

  const uploaded = await store.list(prefix);
  const relativeKeys = uploaded.map((key) => relative(prefix, key));
  expect(relativeKeys).toContain(
    `data/sessions/${conversationId}/claude/projects/foreign-slug/${input.kind}-session.jsonl`,
  );
  expect(relativeKeys).toContain(
    `data/sessions/${conversationId}/claude/sessions.json`,
  );
  expect(relativeKeys).not.toContain("data/auth.json");
  expect(relativeKeys).not.toContain(
    `data/sessions/${conversationId}/claude/statsig/cache.json`,
  );
  expect(relativeKeys).not.toContain(
    `data/sessions/${conversationId}/claude/.credentials.json`,
  );
});
