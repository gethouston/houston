import { expect, test, vi } from "vitest";
import { runWithActingContext } from "../session/acting-context";
import { bridgeReadiness, refreshBridgeReadiness } from "./bridge-readiness";
import { bridgeFetch } from "./local-model-transport";

const bridge = {
  id: "00000000-0000-4000-8000-000000000001",
  version: 1 as const,
};
const scope = (id: string) => ({
  actingAs: `signed-${id}`,
  localModelTransport: {
    baseUrl: "http://gateway.internal:8080",
    orgSlug: `org-${id}`,
    agentSlug: `agent-${id}`,
    hostToken: `host-${id}`,
  },
});

test("bridge sends only scoped host/acting credentials to the trusted callback", async () => {
  const requests: Request[] = [];
  const transport: typeof fetch = vi.fn(async (input) => {
    requests.push(new Request(input));
    return new Response("data: hello\n\n");
  });
  await runWithActingContext(scope("a"), async () => {
    const response = await bridgeFetch(
      bridge,
      "model",
      transport,
    )("https://attacker.test/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer private-model-key",
        Cookie: "private-cookie",
        "x-private": "secret",
      },
      body: JSON.stringify({ model: "model" }),
    });
    expect(await response.text()).toBe("data: hello\n\n");
  });
  expect(requests[0].url).toBe(
    `http://gateway.internal:8080/v1/pod/local-model-bridges/org-a/agent-a/${bridge.id}/v1/chat/completions`,
  );
  expect(requests[0].headers.get("authorization")).toBe("Bearer host-a");
  expect(requests[0].headers.get("x-houston-acting-as")).toBe("signed-a");
  expect(requests[0].headers.has("cookie")).toBe(false);
  expect(requests[0].headers.has("x-private")).toBe(false);
  expect(requests[0].redirect).toBe("error");
});
test("parallel worker scopes cannot exchange credentials", async () => {
  const seen: string[] = [];
  const transport: typeof fetch = async (input) => {
    const req = new Request(input);
    seen.push(
      `${req.url}|${req.headers.get("authorization")}|${req.headers.get("x-houston-acting-as")}`,
    );
    return new Response("{}");
  };
  await Promise.all(
    ["a", "b"].map((id) =>
      runWithActingContext(scope(id), async () => {
        const scopedFetch = bridgeFetch(bridge, "model", transport);
        await Promise.resolve();
        await scopedFetch("https://display.invalid/v1/models");
      }),
    ),
  );
  expect(seen).toContain(
    `http://gateway.internal:8080/v1/pod/local-model-bridges/org-a/agent-a/${bridge.id}/v1/models|Bearer host-a|signed-a`,
  );
  expect(seen).toContain(
    `http://gateway.internal:8080/v1/pod/local-model-bridges/org-b/agent-b/${bridge.id}/v1/models|Bearer host-b|signed-b`,
  );
});
test("bare attribution cannot authorize bridge transport", () => {
  runWithActingContext(
    { ...scope("a"), actingAs: undefined, actingUser: "a" },
    () => {
      expect(() => bridgeFetch(bridge, "model")).toThrow(
        "authorization required",
      );
    },
  );
});
test("request cancellation is preserved and transport never retries", async () => {
  const abort = new AbortController();
  let calls = 0;
  const transport: typeof fetch = async (input) => {
    calls++;
    const req = new Request(input);
    await new Promise<void>((resolve) =>
      req.signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    throw new DOMException("cancelled", "AbortError");
  };
  await runWithActingContext(scope("a"), async () => {
    const request = bridgeFetch(
      bridge,
      "model",
      transport,
    )("https://display.invalid/v1/models", { signal: abort.signal });
    abort.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
  expect(calls).toBe(1);
});
test("arbitrary operations are rejected before network activity", async () => {
  const transport = vi.fn<typeof fetch>();
  await runWithActingContext(scope("a"), async () => {
    await expect(
      bridgeFetch(
        bridge,
        "model",
        transport,
      )("https://display.invalid/private", { method: "DELETE" }),
    ).rejects.toThrow("unsupported");
  });
  expect(transport).not.toHaveBeenCalled();
});

test("readiness requires selected model and is isolated to authenticated request", async () => {
  const mocked = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: [{ id: "other-model" }] }), {
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", mocked);
  try {
    await runWithActingContext(scope("a"), async () => {
      expect(await refreshBridgeReadiness(bridge, "model")).toBe(false);
      expect(bridgeReadiness(bridge, "model")).toBe(false);
      mocked.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "model" }] }), {
          headers: { "content-type": "application/json" },
        }),
      );
      expect(await refreshBridgeReadiness(bridge, "model")).toBe(true);
      expect(bridgeReadiness(bridge, "model")).toBe(true);
    });
    runWithActingContext(scope("a"), () =>
      expect(bridgeReadiness(bridge, "model")).toBe(false),
    );
    runWithActingContext(scope("b"), () =>
      expect(bridgeReadiness(bridge, "model")).toBe(false),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
