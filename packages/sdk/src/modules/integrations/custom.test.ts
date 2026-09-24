import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { IntegrationsHttpError } from "./types";

/**
 * The SDK contract for the provider-scoped reads and the custom-connector
 * surface: the route each call issues, and the promise that a non-2xx ALWAYS
 * throws. A 404 on the definitions read means "this deployment serves no
 * custom integrations" to the web adapter and can mean something else to
 * another caller, so the decision belongs to the surface — the SDK must never
 * soft-result it here.
 */

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  path: string;
  search: string;
  body?: unknown;
}

function makeSdk(status = 200, payload: unknown = { items: [] }) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      calls.push({
        method: init?.method ?? "GET",
        path: url.pathname,
        search: url.search,
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
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

describe("integrations reads — the provider is the caller's, not composio's", () => {
  it("asks the provider segment the caller named", async () => {
    const { sdk, calls } = makeSdk();

    await sdk.integrations.reads.toolkits("custom");
    await sdk.integrations.reads.connections("composio");
    await sdk.integrations.reads.connection("custom", "c/1");

    expect(calls.map((c) => c.path)).toEqual([
      "/v1/integrations/custom/toolkits",
      "/v1/integrations/composio/connections",
      "/v1/integrations/custom/connections/c%2F1",
    ]);
  });

  it("carries the trigger toolkit as an escaped query value", async () => {
    const { sdk, calls } = makeSdk();

    await sdk.integrations.reads.triggerTypes("git hub");

    expect(calls[0].path).toBe("/v1/integrations/composio/trigger-types");
    expect(calls[0].search).toBe("?toolkit=git%20hub");
  });
});

describe("custom integrations — one data set, two route families", () => {
  it("reaches the user-scoped routes when no agent is named", async () => {
    const { sdk, calls } = makeSdk();

    await sdk.integrations.custom.list();
    await sdk.integrations.custom.remove("a/b");
    await sdk.integrations.custom.startOAuth("acme");

    expect(calls).toEqual([
      {
        method: "GET",
        path: "/v1/integrations/custom/definitions",
        search: "",
        body: undefined,
      },
      {
        method: "DELETE",
        path: "/v1/integrations/custom/definitions/a%2Fb",
        search: "",
        body: undefined,
      },
      {
        method: "POST",
        path: "/v1/integrations/custom/definitions/acme/oauth/start",
        search: "",
        body: undefined,
      },
    ]);
  });

  it("reaches the agent's pod when one is named", async () => {
    const { sdk, calls } = makeSdk();

    await sdk.integrations.agentCustom.list("a 1");
    await sdk.integrations.agentCustom.detect("a1", "https://acme.test");
    await sdk.integrations.agentCustom.updateDetails("a1", "acme", {
      name: "Acme",
      website: "https://acme.test",
    });

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /agents/a%201/integrations/custom/definitions",
      "POST /agents/a1/integrations/custom/detect",
      "PATCH /agents/a1/integrations/custom/definitions/acme",
    ]);
    expect(calls[1].body).toEqual({ url: "https://acme.test" });
  });
});

describe("degradation is the surface's call, never the SDK's", () => {
  it("throws a status-bearing error on a 404 definitions read", async () => {
    const { sdk } = makeSdk(404, {});

    await expect(sdk.integrations.custom.list()).rejects.toBeInstanceOf(
      IntegrationsHttpError,
    );
    await expect(sdk.integrations.agentCustom.list("a1")).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("keeps the host's body on the error, so a caller can read its code", async () => {
    const { sdk } = makeSdk(404, { code: "not_found" });

    await expect(sdk.integrations.custom.tools("gone")).rejects.toMatchObject({
      message: JSON.stringify({ code: "not_found" }),
    });
  });
});
