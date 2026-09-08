import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { runWithActingContext } from "../session/acting-context";
import { parseAgentOp } from "../turn/op-grammar";
import { registerTurnProviders } from "../turn/turn-runtime";
import {
  buildActiveCustomModel,
  customEndpointStatus,
  endpointFileIn,
  registerCustomProviderIfConfigured,
  setCustomEndpointConfigIn,
} from "./openai-compatible";

const bridge = {
  id: "00000000-0000-4000-8000-000000000001",
  version: 1 as const,
};
const input = {
  baseUrl: "https://display.example/v1",
  model: "local",
  bridge,
  name: "Named",
  reasoning: true,
  contextWindow: 8192,
};
const fresh = () => mkdtempSync(join(tmpdir(), "managed-model-"));
type ProviderConfig = Parameters<ModelRuntime["registerProvider"]>[1];
function registrar() {
  const configurations = new Map<string, ProviderConfig>();
  return {
    configurations,
    registerProvider: (id: string, cfg: ProviderConfig) => {
      configurations.set(id, cfg);
    },
    unregisterProvider: (id: string) => {
      configurations.delete(id);
    },
    getRegisteredProviderConfig: (id: string) => configurations.get(id),
  };
}
afterEach(() => vi.unstubAllGlobals());

test("bridge metadata survives persistence/status and sleeping op grammar", () => {
  const dir = fresh();
  setCustomEndpointConfigIn(dir, input);
  expect(JSON.parse(readFileSync(endpointFileIn(dir), "utf8"))).toMatchObject(
    input,
  );
  expect(customEndpointStatus(dir).endpoint).toMatchObject(input);
  expect(
    parseAgentOp({ kind: "settings", action: "endpoint", input }),
  ).toMatchObject({ input });
  expect(() =>
    parseAgentOp({
      kind: "settings",
      action: "endpoint",
      input: {
        ...input,
        bridge: { ...bridge, arbitraryUrl: "https://bad.test" },
      },
    }),
  ).toThrow();
});
test("malformed persisted bridge metadata cannot downgrade into direct transport", () => {
  const dir = fresh();
  writeFileSync(
    endpointFileIn(dir),
    JSON.stringify({ ...input, bridge: null }),
  );
  expect(() => buildActiveCustomModel(undefined, dir)).toThrow(
    "No local model configured",
  );
});
test.each([
  registerCustomProviderIfConfigured,
  registerTurnProviders,
])("warm and pooled registration use the bridge and disable HTTP retries", async (register) => {
  const dir = fresh();
  setCustomEndpointConfigIn(dir, input);
  const runtime = registrar();
  register(runtime, dir);
  const cfg = runtime.configurations.get("openai-compatible");
  expect(cfg?.streamSimple).toBeTypeOf("function");
  let calls = 0;
  let url = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      calls++;
      url = request.url;
      return new Response(
        JSON.stringify({ error: { message: "model unavailable" } }),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    }),
  );
  const token = `acting-v1.${Buffer.from(JSON.stringify({ sub: "member" })).toString("base64url")}.signature`;
  await runWithActingContext(
    {
      actingAs: token,
      localModelTransport: {
        baseUrl: "https://trusted.gateway",
        orgSlug: "org",
        agentSlug: "agent",
        hostToken: "host",
      },
    },
    async () => {
      const stream = cfg?.streamSimple?.(
        buildActiveCustomModel(undefined, dir),
        { messages: [] },
        { apiKey: "placeholder" },
      );
      expect(stream).toBeDefined();
      const result = await stream?.result();
      expect(result?.stopReason).toBe("error");
    },
  );
  expect(calls).toBe(1);
  expect(url).toBe(
    `https://trusted.gateway/v1/pod/local-model-bridges/org/agent/${bridge.id}/v1/chat/completions`,
  );
});
test("ordinary direct endpoints keep pi's normal transport", () => {
  const dir = fresh();
  const { bridge: _bridge, ...direct } = input;
  setCustomEndpointConfigIn(dir, direct);
  const runtime = registrar();
  registerCustomProviderIfConfigured(runtime, dir);
  expect(
    runtime.configurations.get("openai-compatible")?.streamSimple,
  ).toBeUndefined();
  expect(buildActiveCustomModel(undefined, dir).baseUrl).toBe(input.baseUrl);
});
