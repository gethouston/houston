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
