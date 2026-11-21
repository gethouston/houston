import { HoustonClient } from "@houston/engine-adapter/client";
import {
  HoustonEngineError,
  isSignedOutEngineError,
} from "@houston/engine-adapter/client/errors";
import { wakingStuckTracker } from "@houston/engine-adapter/waking-stuck-tracker";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installLocalStorage, json } from "./support/wire-capture";

const BASE = "http://host";
const AGENT = "a1";

const originalFetch = globalThis.fetch;
let calls: string[];

beforeEach(() => {
  installLocalStorage();
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function stubFetch(make: () => Response) {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    calls.push(new URL(String(input)).pathname);
    return make();
  }) as unknown as typeof fetch;
}

const client = () =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane: true });

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
