import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { ProvidersHttpError } from "./credential-store";

const BASE = "http://127.0.0.1:4317";
const AGENT = "ag_1";

interface Recorded {
  method: string;
  path: string;
  body: string | null;
}

/**
 * An SDK over a mock `fetch` recording every credential-store call. These are
 * gateway CONTROL routes about an agent, so they must land on the base URL —
 * never on a `clientFor(agentId)` sub-client — and each must be exactly ONE
 * request: the web adapter owns its own read model, so a post-write refetch
 * here would be a second request it never asked for.
 */
function makeSdk(respond: () => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: init?.method ?? "GET",
        path: new URL(String(input)).pathname,
        body: typeof init?.body === "string" ? init.body : null,
      });
      return respond();
    },
  );
  const store = new Map<string, string>();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(store),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls };
}

const ok = () => new Response("{}", { status: 200 });

describe("providers module — the workspace-central credential store", () => {
  it("writes the per-agent routes on the base URL, one request each", async () => {
    const { sdk, calls } = makeSdk(ok);
    const { credentials } = sdk.providers;

    await credentials.forgetCredential(AGENT, "anthropic");
    await credentials.setApiKey(AGENT, "mistral", "sk-1");
    await credentials.setCustomEndpoint(AGENT, {
      baseUrl: "http://localhost:1234/v1",
      model: "llama",
    });

    expect(calls).toEqual([
      {
        method: "POST",
        path: `/agents/${AGENT}/credential/forget`,
        body: JSON.stringify({ provider: "anthropic" }),
      },
      {
        method: "POST",
        path: `/agents/${AGENT}/credential/api-key`,
        body: JSON.stringify({ provider: "mistral", apiKey: "sk-1" }),
      },
      {
        method: "POST",
        path: `/agents/${AGENT}/provider/openai-compatible`,
        body: JSON.stringify({
          baseUrl: "http://localhost:1234/v1",
          model: "llama",
        }),
      },
    ]);
    sdk.dispose();
  });

  it("writes the agentless mirrors on the setup runtime", async () => {
    const { sdk, calls } = makeSdk(ok);
    const { credentials } = sdk.providers;

    await credentials.captureSetupCredential();
    await credentials.setSetupApiKey("mistral", "sk-1", "https://az.example");
    await credentials.forgetSetupCredential("anthropic");
    await credentials.pushSetupClaudeOAuthCredential("{}");

    expect(calls).toEqual([
      // No provider named means no body at all — the host reads the runtime's
      // own freshest credential, and an empty JSON object would not say that.
      { method: "POST", path: "/setup-runtime/credential/capture", body: null },
      {
        method: "POST",
        path: "/setup-runtime/credential/api-key",
        body: JSON.stringify({
          provider: "mistral",
          apiKey: "sk-1",
          endpoint: "https://az.example",
        }),
      },
      {
        method: "POST",
        path: "/setup-runtime/credential/forget",
        body: JSON.stringify({ provider: "anthropic" }),
      },
      {
        method: "POST",
        path: "/setup-runtime/credential/claude-oauth",
        body: "{}",
      },
    ]);
    sdk.dispose();
  });

  it("throws the host's reason with its status; nothing degrades", async () => {
    const { sdk } = makeSdk(
      () => new Response("unknown API-key provider", { status: 400 }),
    );

    const failure = await sdk.providers.credentials
      .setApiKey(AGENT, "nope", "sk-1")
      .catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(ProvidersHttpError);
    expect((failure as ProvidersHttpError).status).toBe(400);
    expect((failure as ProvidersHttpError).message).toBe(
      "unknown API-key provider",
    );
    sdk.dispose();
  });

  it("surfaces a 401 with its status, for the host to recognise a signed-out session", async () => {
    const { sdk } = makeSdk(
      () =>
        new Response(JSON.stringify({ error: "signed_out" }), { status: 401 }),
    );

    const failure = await sdk.providers.credentials
      .forgetCredential(AGENT, "anthropic")
      .catch((err: unknown) => err);

    // The web adapter translates this into its own HoustonEngineError and reads
    // both back (`client/sdk-error.ts`), which is how a lapsed session shows as
    // a sign-in prompt rather than a red "sign-out failed" toast.
    expect(failure).toBeInstanceOf(ProvidersHttpError);
    expect((failure as ProvidersHttpError).status).toBe(401);
    expect((failure as ProvidersHttpError).message).toBe(
      JSON.stringify({ error: "signed_out" }),
    );
    sdk.dispose();
  });
});
