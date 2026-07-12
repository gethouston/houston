import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  appDisplayName,
  buildLocalEndpoint,
  connectableServers,
  type DetectedServer,
  defaultEndpointName,
  defaultModelFor,
  reconnectBridgeArgs,
  type SavedBridgeTarget,
  sessionOwnsBridge,
} from "../src/lib/local-model.ts";
import { looksLikeReasoningModel } from "../src/lib/local-model-reasoning.ts";

function server(extra: Partial<DetectedServer> = {}): DetectedServer {
  return {
    kind: "lmstudio",
    baseUrl: "http://localhost:1234/v1",
    port: 1234,
    models: ["llama-3.1"],
    reachable: true,
    ...extra,
  };
}

describe("local-model helpers", () => {
  it("names known apps by brand and falls back for unknown", () => {
    strictEqual(appDisplayName("lmstudio"), "LM Studio");
    strictEqual(appDisplayName("jan"), "Jan");
    strictEqual(appDisplayName("ollama"), "Ollama");
    strictEqual(appDisplayName("unknown"), "Local model");
  });

  it("preselects the first advertised model, empty when none", () => {
    strictEqual(defaultModelFor(server({ models: ["a", "b"] })), "a");
    strictEqual(defaultModelFor(server({ models: [] })), "");
  });

  it("builds a friendly endpoint name without an em dash", () => {
    const name = defaultEndpointName("lmstudio", "llama-3.1");
    strictEqual(name, "LM Studio · llama-3.1");
    strictEqual(name.includes("—"), false);
    // No model -> just the app name.
    strictEqual(defaultEndpointName("ollama", ""), "Ollama");
  });

  it("keeps only reachable servers that advertise a model", () => {
    const list = [
      server({ baseUrl: "a", reachable: true, models: ["m"] }),
      server({ baseUrl: "b", reachable: false, models: ["m"] }),
      server({ baseUrl: "c", reachable: true, models: [] }),
    ];
    deepStrictEqual(
      connectableServers(list).map((s) => s.baseUrl),
      ["a"],
    );
  });

  it("registers the public tunnel URL as an OpenAI-compatible /v1 endpoint", () => {
    deepStrictEqual(
      buildLocalEndpoint({
        publicUrl: "https://sub.relay.example.com",
        model: "llama-3.1",
        name: "LM Studio · llama-3.1",
        proxyKey: "secret",
      }),
      {
        baseUrl: "https://sub.relay.example.com/v1",
        model: "llama-3.1",
        name: "LM Studio · llama-3.1",
        apiKey: "secret",
      },
    );
  });

  it("marks the endpoint as reasoning only when the toggle is on", () => {
    const base = {
      publicUrl: "https://sub.relay.example.com",
      model: "deepseek-r1",
      name: "n",
      proxyKey: "k",
    };
    // Off / omitted => no reasoning key on the payload (kept clean).
    strictEqual("reasoning" in buildLocalEndpoint(base), false);
    strictEqual(
      "reasoning" in buildLocalEndpoint({ ...base, reasoning: false }),
      false,
    );
    // On => reasoning: true.
    strictEqual(
      buildLocalEndpoint({ ...base, reasoning: true }).reasoning,
      true,
    );
  });

  it("marks the endpoint as team-shared only when the toggle is on", () => {
    const base = {
      publicUrl: "https://sub.relay.example.com",
      model: "qwen",
      name: "n",
      proxyKey: "k",
    };
    strictEqual("shared" in buildLocalEndpoint(base), false);
    strictEqual(
      "shared" in buildLocalEndpoint({ ...base, shared: false }),
      false,
    );
    strictEqual(buildLocalEndpoint({ ...base, shared: true }).shared, true);
  });

  it("detects reasoning models by id substring, case-insensitively", () => {
    for (const id of [
      "DeepSeek-R1",
      "deepseek-r1-distill",
      "QwQ-32B",
      "Magistral-Small",
      "phi-4-reasoning",
      "phi-4-reasoning-plus",
      "some-thinking-model",
      "openai/o1-preview",
      "o3-mini",
      "Qwen3-30B-A4B",
    ]) {
      strictEqual(looksLikeReasoningModel(id), true, id);
    }
  });

  it("does not flag ordinary chat models as reasoning", () => {
    for (const id of ["llama-3.1", "gemma-2-9b", "mistral-7b", "gpt-4o-mini"]) {
      strictEqual(looksLikeReasoningModel(id), false, id);
    }
  });

  it("does not double the slash when publicUrl has a trailing slash", () => {
    strictEqual(
      buildLocalEndpoint({
        publicUrl: "https://sub.relay.example.com/",
        model: "m",
        name: "n",
        proxyKey: "k",
      }).baseUrl,
      "https://sub.relay.example.com/v1",
    );
  });

  it("maps tunnel credentials to reconnect args (relay coords + token only)", () => {
    deepStrictEqual(
      reconnectBridgeArgs({
        subdomain: "sub",
        publicUrl: "https://sub.relay.example.com",
        relayHost: "relay.example.com",
        relayPort: 7000,
        token: "tok",
        tokenExpiresAt: "2030-01-01T00:00:00Z",
        transport: "wss",
      }),
      {
        relayHost: "relay.example.com",
        relayPort: 7000,
        subdomain: "sub",
        token: "tok",
      },
    );
  });
});

describe("sessionOwnsBridge (tunnel-vs-direct pill rule)", () => {
  const target: SavedBridgeTarget = {
    targetBaseUrl: "http://localhost:1234",
    transport: "wss",
    appName: "LM Studio",
  };

  it("owns the pill when this machine has a saved target, even when down", () => {
    strictEqual(sessionOwnsBridge(target, null), true);
    strictEqual(sessionOwnsBridge(target, { status: "offline" }), true);
  });

  it("owns the pill when a bridge is currently active", () => {
    strictEqual(sessionOwnsBridge(null, { status: "online" }), true);
    strictEqual(sessionOwnsBridge(null, { status: "connecting" }), true);
    strictEqual(sessionOwnsBridge(null, { status: "error" }), true);
  });

  it("is direct (no pill) with no saved target and no active bridge", () => {
    strictEqual(sessionOwnsBridge(null, null), false);
    strictEqual(sessionOwnsBridge(null, { status: "offline" }), false);
  });
});
