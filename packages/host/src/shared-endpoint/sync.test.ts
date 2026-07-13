import { expect, test, vi } from "vitest";
import type {
  OrgSharedEndpoint,
  SharedEndpointStore,
} from "../credentials/remote-shared-endpoint-store";
import type { RuntimeEndpoint } from "../ports";
import { syncSharedEndpoint } from "./sync";

const runtime: RuntimeEndpoint = {
  baseUrl: "http://runtime.test",
  token: "runtime-token",
};

const shared: OrgSharedEndpoint = {
  baseUrl: "https://relay.example.com/v1",
  model: "qwen",
  name: "Team Qwen",
  contextWindow: 131_072,
  reasoning: false,
  apiKey: "secret",
  ownerAgent: "0123456789abcdef",
};

function store(value: OrgSharedEndpoint | null): SharedEndpointStore {
  return {
    get: async () => value,
    put: async () => {},
    remove: async () => {},
  };
}

function runtimeFetch(status: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify(init?.method === "POST" ? { ok: true } : status),
      { status: 200 },
    );
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function writes(calls: { url: string; init?: RequestInit }[]) {
  return calls.slice(1).map((call) => ({
    path: new URL(call.url).pathname,
    body:
      typeof call.init?.body === "string"
        ? JSON.parse(call.init.body)
        : undefined,
  }));
}

test.each([
  {
    name: "seeds an unconfigured runtime",
    gateway: shared,
    status: { configured: false, orgShared: false },
    expected: [
      {
        path: "/providers/openai-compatible",
        body: {
          baseUrl: shared.baseUrl,
          model: shared.model,
          name: shared.name,
          contextWindow: shared.contextWindow,
          reasoning: shared.reasoning,
          apiKey: shared.apiKey,
          orgShared: true,
        },
      },
    ],
  },
  {
    // Re-seed even when the visible descriptor is identical: the status never
    // exposes the api key, and the owner's reconnect rotates the proxyKey
    // under the SAME tunnel URL — skipping here would strand teammates on the
    // dead key.
    name: "re-seeds an equal-looking organization-hydrated endpoint (key may have rotated)",
    gateway: shared,
    status: {
      configured: true,
      orgShared: true,
      endpoint: {
        baseUrl: shared.baseUrl,
        model: shared.model,
        name: shared.name,
        contextWindow: shared.contextWindow,
        reasoning: shared.reasoning,
      },
    },
    expected: [
      {
        path: "/providers/openai-compatible",
        body: {
          baseUrl: shared.baseUrl,
          model: shared.model,
          name: shared.name,
          contextWindow: shared.contextWindow,
          reasoning: shared.reasoning,
          apiKey: shared.apiKey,
          orgShared: true,
        },
      },
    ],
  },
  {
    name: "updates a stale organization-hydrated endpoint",
    gateway: shared,
    status: {
      configured: true,
      orgShared: true,
      endpoint: { baseUrl: shared.baseUrl, model: "old-model" },
    },
    expected: [
      {
        path: "/providers/openai-compatible",
        body: {
          baseUrl: shared.baseUrl,
          model: shared.model,
          name: shared.name,
          contextWindow: shared.contextWindow,
          reasoning: shared.reasoning,
          apiKey: shared.apiKey,
          orgShared: true,
        },
      },
    ],
  },
  {
    name: "preserves a user's own configured endpoint",
    gateway: shared,
    status: {
      configured: true,
      orgShared: false,
      endpoint: { baseUrl: "https://mine.example.com/v1", model: "mine" },
    },
    expected: [],
  },
  {
    name: "clears an organization endpoint after the share disappears",
    gateway: null,
    status: {
      configured: true,
      orgShared: true,
      endpoint: { baseUrl: shared.baseUrl, model: shared.model },
    },
    expected: [{ path: "/auth/openai-compatible/logout", body: undefined }],
  },
  {
    name: "does nothing without a share or organization marker",
    gateway: null,
    status: { configured: false, orgShared: false },
    expected: [],
  },
])("$name", async ({ gateway, status, expected }) => {
  const { calls, fetchImpl } = runtimeFetch(status);

  await syncSharedEndpoint({
    store: store(gateway),
    runtime,
    fetchImpl,
    log: vi.fn(),
  });

  expect(calls[0]?.url).toBe("http://runtime.test/providers/openai-compatible");
  expect(writes(calls)).toEqual(expected);
});

test("sync failures are logged and never reject runtime startup", async () => {
  const log = vi.fn();
  const failingStore: SharedEndpointStore = {
    get: async () => {
      throw new Error("gateway unavailable");
    },
    put: async () => {},
    remove: async () => {},
  };

  await expect(
    syncSharedEndpoint({ store: failingStore, runtime, log }),
  ).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledWith(
    "[shared-endpoint] runtime sync failed (continuing):",
    expect.objectContaining({ message: "gateway unavailable" }),
  );
});
