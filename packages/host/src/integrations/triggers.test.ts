import { expect, test } from "vitest";
import { ComposioProvider } from "./composio";
import { FakeIntegrationProvider } from "./fake";
import { RemoteIntegrationProvider } from "./remote";
import { NoConnectedAccountError, TriggersUnsupportedError } from "./types";

/**
 * The C9 trigger verbs across the three adapters. Mirrors composio.test.ts's
 * fetch-mock harness: the Composio adapter is pinned to the exact v3 REST paths
 * + bodies and its non-2xx surfaces, the fake proves the port is implementable
 * in-memory, and the gateway adapter refuses every verb (the desktop never
 * reconciles).
 */

type Reply = { status?: number; body?: unknown };
interface Recorded {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function harness(handler: (url: URL, method: string) => Reply) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path: url.pathname + url.search, method, headers, body });
    const r = handler(url, method);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const provider = new ComposioProvider({
    apiKey: "pk_test",
    baseURL: "https://cmp.test",
    fetch: fetchImpl,
  });
  return { provider, calls };
}

const USER = "supabase-sub-1";

// ── ComposioProvider (direct adapter) ──────────────────────────────────────

test("listTriggerTypes scopes by toolkit and maps the catalog", async () => {
  const { provider, calls } = harness((url) => {
    if (url.pathname === "/api/v3/triggers_types") {
      return {
        body: {
          items: [
            {
              slug: "GMAIL_NEW_GMAIL_MESSAGE",
              name: "New email",
              description: "Fires on a new inbox message",
              type: "webhook",
              config: { properties: { labelIds: {} } },
              payload: { properties: { subject: {} } },
            },
            // A poll-type with no explicit config → defaults to {}.
            { slug: "GITHUB_STAR", name: "New star", type: "poll" },
          ],
        },
      };
    }
    return { status: 404 };
  });
  expect(await provider.listTriggerTypes("gmail")).toEqual([
    {
      slug: "GMAIL_NEW_GMAIL_MESSAGE",
      name: "New email",
      description: "Fires on a new inbox message",
      type: "webhook",
      config: { properties: { labelIds: {} } },
      payload: { properties: { subject: {} } },
    },
    {
      slug: "GITHUB_STAR",
      name: "New star",
      description: undefined,
      type: "poll",
      config: {},
      payload: undefined,
    },
  ]);
  expect(calls[0]?.path).toBe(
    "/api/v3/triggers_types?toolkit_slugs=gmail&limit=100",
  );
  expect(calls[0]?.headers["x-api-key"]).toBe("pk_test");
});

test("an unrecognized trigger type decodes as the conservative poll class", async () => {
  const { provider } = harness(() => ({
    body: { items: [{ slug: "X", name: "X", type: "cron" }] },
  }));
  expect((await provider.listTriggerTypes("x"))[0]?.type).toBe("poll");
});

test("upsertTriggerInstance resolves the user's active account and posts the instance", async () => {
  const { provider, calls } = harness((url, method) => {
    if (url.pathname === "/api/v3/connected_accounts" && method === "GET") {
      return {
        body: {
          items: [
            { toolkit: { slug: "gmail" }, id: "ca_1", status: "ACTIVE" },
            { toolkit: { slug: "slack" }, id: "ca_2", status: "ACTIVE" },
          ],
        },
      };
    }
    if (
      url.pathname ===
      "/api/v3/trigger_instances/GMAIL_NEW_GMAIL_MESSAGE/upsert"
    ) {
      return { body: { id: "ti_9" } };
    }
    return { status: 404 };
  });
  const ref = await provider.upsertTriggerInstance(USER, {
    toolkit: "gmail",
    triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
    triggerConfig: { labelIds: ["INBOX"] },
  });
  expect(ref).toEqual({ triggerInstanceId: "ti_9" });
  expect(calls[1]?.method).toBe("POST");
  expect(calls[1]?.path).toBe(
    "/api/v3/trigger_instances/GMAIL_NEW_GMAIL_MESSAGE/upsert",
  );
  expect(calls[1]?.body).toEqual({
    connected_account_id: "ca_1",
    user_id: USER,
    trigger_config: { labelIds: ["INBOX"] },
  });
});

test("upsertTriggerInstance uses a pinned account and skips the lookup", async () => {
  const { provider, calls } = harness((url) => {
    if (
      url.pathname ===
      "/api/v3/trigger_instances/GMAIL_NEW_GMAIL_MESSAGE/upsert"
    ) {
      return { body: { id: "ti_pin" } };
    }
    return { status: 404 };
  });
  const ref = await provider.upsertTriggerInstance(USER, {
    toolkit: "gmail",
    triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
    triggerConfig: {},
    connectedAccountId: "ca_pinned",
  });
  expect(ref.triggerInstanceId).toBe("ti_pin");
  // No connected_accounts listing — the pinned id is used directly.
  expect(
    calls.some((c) => c.path.startsWith("/api/v3/connected_accounts")),
  ).toBe(false);
  expect(calls[0]?.body).toMatchObject({ connected_account_id: "ca_pinned" });
});

test("upsertTriggerInstance throws the typed error when no active account exists", async () => {
  const { provider } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts") {
      // Present but not ACTIVE → still no bindable account.
      return {
        body: {
          items: [
            { toolkit: { slug: "gmail" }, id: "ca_1", status: "EXPIRED" },
          ],
        },
      };
    }
    return { status: 404 };
  });
  await expect(
    provider.upsertTriggerInstance(USER, {
      toolkit: "gmail",
      triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
      triggerConfig: {},
    }),
  ).rejects.toBeInstanceOf(NoConnectedAccountError);
});

test("upsertTriggerInstance surfaces an upsert reply with no instance id", async () => {
  const { provider } = harness((url) => {
    if (url.pathname.endsWith("/upsert")) return { body: {} };
    return { status: 404 };
  });
  await expect(
    provider.upsertTriggerInstance(USER, {
      toolkit: "gmail",
      triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
      triggerConfig: {},
      connectedAccountId: "ca_x",
    }),
  ).rejects.toThrow(/returned no instance id/);
});

test("setTriggerInstanceStatus PATCHes the manage endpoint with the action", async () => {
  const { provider, calls } = harness(() => ({ body: {} }));
  await provider.setTriggerInstanceStatus("ti_9", "disable");
  expect(calls[0]?.method).toBe("PATCH");
  expect(calls[0]?.path).toBe("/api/v3/trigger_instances/manage/ti_9");
  expect(calls[0]?.body).toEqual({ status: "disable" });
});

test("deleteTriggerInstance DELETEs the manage endpoint", async () => {
  const { provider, calls } = harness(() => ({ status: 204 }));
  await provider.deleteTriggerInstance("ti_9");
  expect(calls[0]?.method).toBe("DELETE");
  expect(calls[0]?.path).toBe("/api/v3/trigger_instances/manage/ti_9");
});

test("a non-2xx trigger call surfaces with method, path and status", async () => {
  const { provider } = harness(() => ({
    status: 500,
    body: { error: "boom" },
  }));
  await expect(
    provider.setTriggerInstanceStatus("ti_9", "enable"),
  ).rejects.toThrow(
    /PATCH \/api\/v3\/trigger_instances\/manage\/ti_9 → 500.*boom/,
  );
});

// ── FakeIntegrationProvider (in-memory double) ─────────────────────────────

test("the fake provisions, updates and deletes an instance with deterministic ids", async () => {
  const p = new FakeIntegrationProvider();
  expect((await p.listTriggerTypes("gmail")).map((t) => t.slug)).toEqual([
    "GMAIL_NEW_GMAIL_MESSAGE",
  ]);

  const first = await p.upsertTriggerInstance(USER, {
    toolkit: "gmail",
    triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
    triggerConfig: { labelIds: ["INBOX"] },
  });
  expect(first.triggerInstanceId).toBe("ti-1");
  expect(p.triggerInstance("ti-1")).toMatchObject({ status: "enable" });

  // Re-upsert of the same (user, trigger, account) is idempotent + updates config.
  const again = await p.upsertTriggerInstance(USER, {
    toolkit: "gmail",
    triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
    triggerConfig: { labelIds: ["SENT"] },
  });
  expect(again.triggerInstanceId).toBe("ti-1");
  expect(p.triggerInstance("ti-1")?.binding.triggerConfig).toEqual({
    labelIds: ["SENT"],
  });

  await p.setTriggerInstanceStatus("ti-1", "disable");
  expect(p.triggerInstance("ti-1")?.status).toBe("disable");

  await p.deleteTriggerInstance("ti-1");
  expect(p.triggerInstance("ti-1")).toBeUndefined();
  // After delete, a new upsert allocates a fresh id (not reusing ti-1's key).
  const reborn = await p.upsertTriggerInstance(USER, {
    toolkit: "gmail",
    triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
    triggerConfig: {},
  });
  expect(reborn.triggerInstanceId).toBe("ti-2");
});

// ── RemoteIntegrationProvider (gateway adapter) ────────────────────────────

test("the gateway adapter refuses every trigger verb (desktop never reconciles)", async () => {
  const p = new RemoteIntegrationProvider({
    id: "composio",
    upstreamUrl: "https://cloud.test",
    token: () => "sess",
  });
  await expect(p.listTriggerTypes("gmail")).rejects.toBeInstanceOf(
    TriggersUnsupportedError,
  );
  await expect(
    p.upsertTriggerInstance(USER, {
      toolkit: "gmail",
      triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
      triggerConfig: {},
    }),
  ).rejects.toThrow(/managed by the gateway/);
  await expect(
    p.setTriggerInstanceStatus("ti_9", "disable"),
  ).rejects.toBeInstanceOf(TriggersUnsupportedError);
  await expect(p.deleteTriggerInstance("ti_9")).rejects.toBeInstanceOf(
    TriggersUnsupportedError,
  );
});
