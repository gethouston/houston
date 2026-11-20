import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@earendil-works/pi-ai/compat";
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { WireEvent } from "@houston/runtime-client";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { hedgedModelRuntime } from "../../ai/hedged-runtime";
import { runWithProviderResponseCapture } from "../../ai/provider-response";
import { HoustonAuthStore } from "../../auth/credential-store";
import { makeAgentLoader } from "../../session/resource-loader";
import { SentRequests } from "./model-phase";
import { PiSession } from "./session";

/**
 * The response hook only helps if pi actually calls it inside the prompt's
 * async context: a REAL AgentSession (Houston's loader, the hedged runtime)
 * runs a Codex request against a local server that answers the way ChatGPT's
 * gateway did in production, and the card must carry the status and the
 * request id from that answer.
 */

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(400, {
      "content-type": "application/json",
      "x-oai-request-id": "oai-req-1",
      "cf-ray": "ray-1",
    });
    res.end('{"detail":"Bad Request"}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

/** A token shaped like a ChatGPT OAuth access token (pi reads the account id). */
const fakeCodexToken = `x.${Buffer.from(
  JSON.stringify({
    "https://api.openai.com/auth": { chatgpt_account_id: "acct-test" },
  }),
).toString("base64url")}.y`;

test("a Codex 400 over SSE reaches the card with its status and request id", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const cwd = mkdtempSync(join(tmpdir(), "houston-provider-response-"));
  const authStorage = new HoustonAuthStore(join(cwd, "auth.json"));
  authStorage.set("openai-codex", {
    type: "oauth",
    access: fakeCodexToken,
    refresh: "",
    expires: Date.now() + 3_600_000,
  });
  const modelRuntime = await ModelRuntime.create({
    credentials: authStorage,
    modelsPath: join(cwd, "models.json"),
  });
  const model = { ...getModel("openai-codex", "gpt-6-luna"), baseUrl };
  const loader = makeAgentLoader(cwd);
  await loader.reload();
  const settingsManager = SettingsManager.inMemory({
    transport: "sse",
    retry: { enabled: false },
  });
  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    model: model as never,
    thinkingLevel: "medium",
    modelRuntime: hedgedModelRuntime(modelRuntime),
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    resourceLoader: loader,
    tools: [],
    customTools: [],
  });
  const wrapped = new PiSession(session, new SentRequests());
  const events: WireEvent[] = [];
  wrapped.subscribe((e) => events.push(e));
  await runWithProviderResponseCapture(() => wrapped.prompt("hello"));
  const cards = events.filter((e) => e.type === "provider_error");
  expect(cards).toHaveLength(1);
  expect(cards[0]?.data).toMatchObject({
    kind: "unknown",
    provider: "openai-codex",
    model: "gpt-6-luna",
    effort: "medium",
    http_status: 400,
    request_id: "oai-req-1",
  });
  vi.restoreAllMocks();
});
