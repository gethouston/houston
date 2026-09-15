import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import {
  HoustonEngineError,
  isSignedOutEngineError,
} from "../src/engine-adapter/client/errors";
import { wakingStuckTracker } from "../src/engine-adapter/waking-stuck-tracker";

/**
 * Every delegated SDK call wears `cpFetch`'s two observable behaviors, because
 * every one of them goes through `viaSdk` (`client/sdk-error.ts`).
 *
 * Both are invisible in the happy path and both were regressions the moment a
 * mixin called `this.ctx.sdk.*` directly:
 *
 *  - the SDK's own errors (`AgentsHttpError`, `EngineError`) are not
 *    `HoustonEngineError`, so `isSignedOutEngineError` read false and the app's
 *    error-toast layer red-toasted a plain sign-out and filed it to Sentry
 *    (`app/src/lib/error-toast.ts`);
 *  - a per-agent success no longer ended that agent's stuck-wake episode
 *    (PRODUCT-1640), so an agent that had been answering "waking" kept its
 *    episode open across calls the pod had plainly answered.
 */

const BASE = "http://host";
const AGENT = "a1";

let calls: string[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Answer every request with `make()`, recording the path asked for. */
function stubFetch(make: () => Response) {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    calls.push(new URL(String(input)).pathname);
    return make();
  }) as unknown as typeof fetch;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const client = () =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane: true });

/** Every control-plane write the mixins hand to the SDK, with the path each
 *  one issues — the identity `viaSdk` translates the failure against. */
const DELEGATED: readonly {
  name: string;
  path: string;
  call: (c: HoustonClient) => Promise<unknown>;
}[] = [
  {
    name: "createAgent",
    path: "/agents",
    call: (c) => c.createAgent("default", { name: "A", configId: "blank" }),
  },
  {
    name: "renameAgent",
    path: `/agents/${AGENT}`,
    call: (c) => c.renameAgent("default", AGENT, "B"),
  },
  {
    name: "deleteAgent",
    path: `/agents/${AGENT}`,
    call: (c) => c.deleteAgent("default", AGENT),
  },
  {
    name: "createActivity",
    path: `/agents/${AGENT}/activities`,
    call: (c) => c.createActivity(AGENT, { title: "T" }),
  },
  {
    name: "deleteActivity",
    path: `/agents/${AGENT}/activities/m1`,
    call: (c) => c.deleteActivity(AGENT, "m1"),
  },
  {
    name: "setIntegrationSession",
    path: "/v1/integrations/session",
    call: (c) => c.setIntegrationSession("token"),
  },
  {
    name: "connectIntegration",
    path: "/v1/integrations/composio/connect",
    call: (c) => c.connectIntegration("composio", "gmail"),
  },
  {
    name: "disconnectIntegration",
    path: "/v1/integrations/composio/disconnect",
    call: (c) => c.disconnectIntegration("composio", "gmail"),
  },
  {
    name: "dismissIntegrationsReconnectNotice",
    path: "/v1/integrations/reconnect-notice/dismiss",
    call: (c) => c.dismissIntegrationsReconnectNotice(),
  },
  {
    name: "setWorkspaceLocale",
    path: "/v1/preferences/locale",
    call: (c) => c.setWorkspaceLocale("default", "pt"),
  },
];

test.each(DELEGATED)("$name surfaces a sign-out the app can recognise", async ({
  path,
  call,
}) => {
  stubFetch(() => json(401, { error: "signed_out" }));

  const err = await call(client()).then(
    () => null,
    (e: unknown) => e,
  );

  expect(isSignedOutEngineError(err)).toBe(true);
  expect(calls).toContain(path);
});

// `provider-agent-gone.ts` keys on the agent id the failure carries; the SDK's
// errors know nothing but a status, so the path is the only place it can come
// from.
test.each(
  DELEGATED.filter((d) => d.path.startsWith("/agents/")),
)("$name names the agent its failure belongs to", async ({ call }) => {
  stubFetch(() => json(503, { error: "engine unavailable" }));

  const err = await call(client()).then(
    () => null,
    (e: unknown) => e,
  );

  expect(err).toBeInstanceOf(HoustonEngineError);
  expect((err as HoustonEngineError).agentId).toBe(AGENT);
});

test("a per-agent write landing ends that agent's stuck-wake episode", async () => {
  const noteSuccess = vi.spyOn(wakingStuckTracker, "noteSuccess");
  stubFetch(() => json(200, {}));

  await client().deleteAgent("default", AGENT);

  expect(noteSuccess).toHaveBeenCalledWith(AGENT);
});

test("a user-scoped write clears no episode — there is no agent in its path", async () => {
  const noteSuccess = vi.spyOn(wakingStuckTracker, "noteSuccess");
  stubFetch(() => json(200, { value: "pt" }));

  await client().setWorkspaceLocale("default", "pt");

  expect(noteSuccess).not.toHaveBeenCalled();
});
