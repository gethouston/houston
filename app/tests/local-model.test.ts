import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  appDisplayName,
  buildDirectEndpoint,
  connectableServers,
  type DetectedServer,
  defaultEndpointName,
  defaultModelFor,
} from "../src/lib/local-model.ts";
import { connectFailureMode } from "../src/lib/local-model-connect-state.ts";
import { looksLikeReasoningModel } from "../src/lib/local-model-reasoning.ts";

function server(extra: Partial<DetectedServer> = {}): DetectedServer {
  return {
    kind: "lmstudio",
    baseUrl: "http://localhost:1234",
    port: 1234,
    models: ["llama-3.1"],
    reachable: true,
    ...extra,
  };
}

describe("local model discovery", () => {
  it("keeps known app names and model selection", () => {
    strictEqual(appDisplayName("lmstudio"), "LM Studio");
    strictEqual(appDisplayName("jan"), "Jan");
    strictEqual(appDisplayName("ollama"), "Ollama");
    strictEqual(appDisplayName("unknown"), "Local model");
    strictEqual(defaultModelFor(server({ models: ["a", "b"] })), "a");
    strictEqual(defaultModelFor(server({ models: [] })), "");
    strictEqual(
      defaultEndpointName("lmstudio", "llama-3.1"),
      "LM Studio · llama-3.1",
    );
    strictEqual(defaultEndpointName("ollama", ""), "Ollama");
  });
  it("only offers reachable servers advertising a model", () => {
    const servers = [
      server(),
      server({ reachable: false }),
      server({ models: [] }),
    ];
    deepStrictEqual(connectableServers(servers), [servers[0]]);
  });
});

describe("direct local endpoints", () => {
  it("preserves a direct endpoint without a bridge or secret", () => {
    deepStrictEqual(
      buildDirectEndpoint({
        server: server(),
        model: "qwen",
        name: "LM Studio · qwen",
      }),
      {
        baseUrl: "http://localhost:1234/v1",
        model: "qwen",
        name: "LM Studio · qwen",
      },
    );
  });
  it("preserves an existing API prefix and strips trailing slashes", () => {
    for (const baseUrl of [
      "http://localhost:1234/v1",
      "http://localhost:1234/v1/",
      "http://localhost:1234/",
    ]) {
      strictEqual(
        buildDirectEndpoint({
          server: server({ baseUrl }),
          model: "qwen",
          name: "n",
        }).baseUrl,
        "http://localhost:1234/v1",
      );
    }
  });
  it("carries only enabled reasoning and sharing choices", () => {
    const input = { server: server(), model: "m", name: "n" };
    strictEqual("reasoning" in buildDirectEndpoint(input), false);
    strictEqual("shared" in buildDirectEndpoint(input), false);
    strictEqual(
      buildDirectEndpoint({ ...input, reasoning: true }).reasoning,
      true,
    );
    strictEqual(buildDirectEndpoint({ ...input, shared: true }).shared, true);
  });
});

describe("reasoning model discovery", () => {
  it("recognizes reasoning model names", () => {
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
    ])
      strictEqual(looksLikeReasoningModel(id), true, id);
  });
  it("does not flag ordinary chat models", () => {
    for (const id of ["llama-3.1", "gemma-2-9b", "mistral-7b", "gpt-4o-mini"])
      strictEqual(looksLikeReasoningModel(id), false, id);
  });
});

describe("guided connect failure screen", () => {
  // PRODUCT-1717: a server without the bridge gets its own copy; "keep the
  // app open and retry" would blame a local app that was never the problem.
  it("lands on the unsupported screen only for bridge_not_supported", () => {
    strictEqual(
      connectFailureMode(
        Object.assign(new Error("engine error 503"), {
          status: 503,
          body: { code: "bridge_not_supported", error: "unsupported" },
        }),
      ),
      "unsupported",
    );
    strictEqual(
      connectFailureMode(
        Object.assign(new Error("engine error 503"), {
          status: 503,
          body: { error: "engine unavailable" },
        }),
      ),
      "error",
    );
    strictEqual(connectFailureMode(new Error("tunnel closed")), "error");
  });
});
