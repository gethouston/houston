import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import { runWithActingContext } from "../acting-context";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import { makeIntegrationTools } from "./integrations";

/**
 * The agent's integration tools are thin proxies to the host's
 * /sandbox/integrations/* under the per-sandbox token. These pin: the right URL
 * + Authorization header, result formatting, and that failures surface (never a
 * silent success) — including the actionable "not connected" (409) case.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Captured {
  url: string;
  auth?: string;
  headers: Record<string, string>;
  body: unknown;
}
function mockFetch(
  reply: (path: string) => { status?: number; body?: unknown },
) {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      auth: headers.authorization,
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = reply(new URL(url).pathname);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const [search, execute, requestConnection, proposeCustom] =
  makeIntegrationTools({
    baseUrl: "https://host.test/",
    sandboxToken: "sb-tok",
  });
if (!search || !execute || !requestConnection || !proposeCustom)
  throw new Error("expected four integration tools");

// pi's tool.execute takes (id, params, signal, onUpdate, ctx); the last two are
// irrelevant to these proxies, so one helper supplies them.
const ctx = {} as unknown as ExtensionContext;
const run = (tool: typeof search, params: unknown) =>
  tool.execute("id", params as never, undefined, undefined, ctx);

test("returns the generic tools plus the two hand-off tools, correctly named", () => {
  expect([
    search.name,
    execute.name,
    requestConnection.name,
    proposeCustom.name,
  ]).toEqual([
    "integration_search",
    "integration_execute",
    "request_connection",
    "propose_custom_integration",
  ]);
});

test("search POSTs to the host proxy with the sandbox token + formats matches", async () => {
  const calls = mockFetch((path) =>
    path === "/sandbox/integrations/search"
      ? {
          body: {
            items: [
              {
                action: "GMAIL_SEND_EMAIL",
                toolkit: "gmail",
                description: "Send an email",
                inputParams: { type: "object" },
              },
            ],
          },
        }
      : { status: 404 },
  );
  const out = await run(search, { query: "send an email" });
  expect(calls[0]?.url).toBe("https://host.test/sandbox/integrations/search");
  expect(calls[0]?.auth).toBe("Bearer sb-tok");
  expect(calls[0]?.body).toEqual({ query: "send an email" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain("GMAIL_SEND_EMAIL");
  expect(text).toContain("Send an email");
  // Everything matched is connected → no connect-card instruction noise.
  expect(text).not.toContain("NOT CONNECTED");
  expect(text).not.toContain("#houston_toolkit=");
});

test("search marks not-connected matches and teaches request_connection", async () => {
  mockFetch(() => ({
    body: {
      items: [
        {
          action: "SLACK_SEND_MESSAGE",
          toolkit: "slack",
          description: "Send a message",
          connected: true,
        },
        {
          action: "GMAIL_SEND_EMAIL",
          toolkit: "gmail",
          description: "Send an email",
          connected: false,
        },
      ],
    },
  }));
  const out = await run(search, { query: "send an email via gmail" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain("- SLACK_SEND_MESSAGE (slack): Send a message");
  expect(text).toContain(
    "- GMAIL_SEND_EMAIL (gmail, NOT CONNECTED): Send an email",
  );
  // The hand-off instruction rides with the results, at the moment the model
  // actually faces a not-connected app — the request_connection tool, NOT the
  // retired markdown-link hack.
  expect(text).toContain("request_connection tool");
  expect(text).not.toContain("#houston_toolkit=");
  expect(text).not.toContain("](https://");
});

test("search tolerates a provider-tagged match and never leaks the tag", async () => {
  // The sandbox multi-provider fan-out stamps each match with its owning
  // provider; the agent-facing tools key on the unique action slug, so the tag
  // is carried for tolerance only and must not surface in the model-facing text.
  mockFetch(() => ({
    body: {
      items: [
        {
          action: "CUSTOM_ACME_CRM_REQUEST",
          toolkit: "acme_crm",
          description: "Acme CRM: records. Generic authenticated HTTP request.",
          connected: true,
          provider: "custom",
        },
      ],
    },
  }));
  const out = await run(search, { query: "acme crm" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain(
    "- CUSTOM_ACME_CRM_REQUEST (acme_crm): Acme CRM: records.",
  );
  // The provider tag is internal routing metadata, never rendered for the model.
  expect(text).not.toContain("provider");
});

test("search lists an app's accounts when the agent has more than one", async () => {
  mockFetch(() => ({
    body: {
      items: [
        {
          action: "GMAIL_SEND_EMAIL",
          toolkit: "gmail",
          description: "Send an email",
          connected: true,
        },
      ],
      accounts: [
        { toolkit: "gmail", connectionId: "ca_1", accountLabel: "Work" },
        { toolkit: "gmail", connectionId: "ca_2", accountLabel: "Personal" },
        // A single-account app is NOT listed (no ambiguity to resolve).
        { toolkit: "slack", connectionId: "ca_9", accountLabel: "Acme" },
      ],
    },
  }));
  const out = await run(search, { query: "send an email" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain(
    'Accounts for gmail: "Work" (ca_1), "Personal" (ca_2)',
  );
  expect(text).toContain("pass the account parameter");
  // Slack has one account → nothing to disambiguate, so it stays out.
  expect(text).not.toContain("Accounts for slack");
});

test("search stays quiet when every granted app has a single account", async () => {
  mockFetch(() => ({
    body: {
      items: [
        {
          action: "GMAIL_SEND_EMAIL",
          toolkit: "gmail",
          description: "Send an email",
          connected: true,
        },
      ],
      accounts: [
        { toolkit: "gmail", connectionId: "ca_1", accountLabel: "Work" },
      ],
    },
  }));
  const out = await run(search, { query: "send an email" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).not.toContain("Accounts for");
  expect(text).not.toContain("pass the account parameter");
});

test("execute runs an action and returns its data; a failed action surfaces", async () => {
  mockFetch(() => ({ body: { successful: true, data: { id: "msg1" } } }));
  const out = await run(execute, {
    action: "GMAIL_SEND_EMAIL",
    params: { to: "a@b.com" },
  });
  expect((out.content[0] as { text: string }).text).toContain("msg1");

  mockFetch(() => ({
    body: { successful: false, error: "missing recipient" },
  }));
  await expect(
    run(execute, { action: "GMAIL_SEND_EMAIL", params: {} }),
  ).rejects.toThrow(/did not succeed: missing recipient/);
});

test("execute forwards a pinned account, and omits it when unset", async () => {
  const withAccount = mockFetch(() => ({
    body: { successful: true, data: { id: "msg1" } },
  }));
  await run(execute, {
    action: "GMAIL_SEND_EMAIL",
    params: { to: "a@b.com" },
    account: "ca_2",
  });
  expect(withAccount[0]?.body).toEqual({
    action: "GMAIL_SEND_EMAIL",
    params: { to: "a@b.com" },
    account: "ca_2",
  });

  // No account named → the key is absent so the host can auto-pin a lone account.
  const noAccount = mockFetch(() => ({ body: { successful: true } }));
  await run(execute, { action: "GMAIL_SEND_EMAIL", params: {} });
  expect(noAccount[0]?.body).toEqual({
    action: "GMAIL_SEND_EMAIL",
    params: {},
  });
});

test("execute 400 account_required returns the choices, does not throw", async () => {
  mockFetch(() => ({
    status: 400,
    body: {
      error: "account_required",
      accounts: [
        { toolkit: "gmail", connectionId: "ca_1", accountLabel: "Work" },
        { toolkit: "gmail", connectionId: "ca_2", accountLabel: "Personal" },
      ],
    },
  }));
  const out = await run(execute, { action: "GMAIL_SEND_EMAIL", params: {} });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain("more than one connected account");
  expect(text).toContain('"Work" (ca_1)');
  expect(text).toContain('"Personal" (ca_2)');
  expect(text).toContain("account parameter");
  expect((out.details as { accountRequired?: boolean }).accountRequired).toBe(
    true,
  );
});

test("a 400 that is not account_required still surfaces as an error", async () => {
  mockFetch(() => ({ status: 400, body: { error: "bad_request" } }));
  await expect(
    run(execute, { action: "GMAIL_SEND_EMAIL", params: {} }),
  ).rejects.toThrow(/execute failed \(400\)/);
});

test("a no-connected-account failure hands off to request_connection", async () => {
  mockFetch(() => ({
    body: { successful: false, error: "no connected account found for user" },
  }));
  const failure = run(execute, { action: "GMAIL_SEND_EMAIL", params: {} });
  await expect(failure).rejects.toThrow(/has not connected this app/);
  await expect(failure).rejects.toThrow(/request_connection tool/);
  await expect(failure).rejects.not.toThrow(/#houston_toolkit=/);

  // An ordinary app rejection stays hint-free — no false connect offers.
  mockFetch(() => ({
    body: { successful: false, error: "quota exceeded" },
  }));
  await expect(
    run(execute, { action: "GMAIL_SEND_EMAIL", params: {} }),
  ).rejects.toThrow(/did not succeed: quota exceeded$/);
});

test("request_connection records a connect interaction with a normalized slug", async () => {
  const holder = newInteractionHolder();
  const out = await runWithInteractionCapture(holder, () =>
    run(requestConnection, {
      toolkit: "  Gmail  ",
      reason: "to send your email",
    }),
  );
  // The slug is trimmed + lowercased so it matches the catalog/connection lists.
  expect(holder.pending).toEqual({
    kind: "connect",
    toolkit: "gmail",
    reason: "to send your email",
  });
  // The tool tells the model to end its turn without spelling out a slug/link.
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/end your turn/i);
  expect(text).not.toContain("#houston_toolkit=");
});

test("request_connection omits an empty reason and rejects an empty slug", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run(requestConnection, { toolkit: "slack" }),
  );
  expect(holder.pending).toEqual({ kind: "connect", toolkit: "slack" });

  await runWithInteractionCapture(newInteractionHolder(), () =>
    expect(run(requestConnection, { toolkit: "   " })).rejects.toThrow(
      /non-empty toolkit/i,
    ),
  );
});

test("propose_custom_integration records a header-auth proposal, no key handling", async () => {
  const holder = newInteractionHolder();
  const out = await runWithInteractionCapture(holder, () =>
    run(proposeCustom, {
      name: "  Acme CRM  ",
      baseUrl: "  https://api.acme.com/v2  ",
      authType: "header",
      authField: "  Authorization  ",
      authPrefix: "Bearer ",
      description: "  Acme CRM records  ",
      reason: "  to read your contacts  ",
    }),
  );
  // Trimmed fields; header auth maps to { type: "header", header, prefix }.
  expect(holder.pending).toEqual({
    kind: "custom_integration",
    proposal: {
      name: "Acme CRM",
      baseUrl: "https://api.acme.com/v2",
      auth: { type: "header", header: "Authorization", prefix: "Bearer " },
      description: "Acme CRM records",
    },
    reason: "to read your contacts",
  });
  // The tool never solicits a key in chat and tells the model to end its turn.
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/end your turn/i);
  expect(text).toMatch(/do not ask the user to paste an api key/i);
});

test("propose_custom_integration maps query auth and omits an empty prefix/reason", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run(proposeCustom, {
      name: "Widgets",
      baseUrl: "https://api.widgets.io",
      authType: "query",
      authField: "api_key",
      description: "Widget catalog",
    }),
  );
  // Query auth maps to { type: "query", param }; no prefix, no reason keys.
  expect(holder.pending).toEqual({
    kind: "custom_integration",
    proposal: {
      name: "Widgets",
      baseUrl: "https://api.widgets.io",
      auth: { type: "query", param: "api_key" },
      description: "Widget catalog",
    },
  });
});

test("propose_custom_integration rejects blank required fields", async () => {
  await runWithInteractionCapture(newInteractionHolder(), () =>
    expect(
      run(proposeCustom, {
        name: "   ",
        baseUrl: "https://api.acme.com",
        authType: "header",
        authField: "Authorization",
        description: "records",
      }),
    ).rejects.toThrow(/non-empty name/i),
  );
  await runWithInteractionCapture(newInteractionHolder(), () =>
    expect(
      run(proposeCustom, {
        name: "Acme",
        baseUrl: "https://api.acme.com",
        authType: "header",
        authField: "   ",
        description: "records",
      }),
    ).rejects.toThrow(/non-empty authField/i),
  );
});

test("request_connection records nothing outside a turn (no ambient holder)", async () => {
  // No runWithInteractionCapture wrapper → recordPendingInteraction is a no-op,
  // so a direct call still succeeds and simply records nowhere.
  await expect(
    run(requestConnection, { toolkit: "gmail" }),
  ).resolves.toBeDefined();
});

test("a 409 (not connected) becomes an actionable message, not a crash dump", async () => {
  mockFetch(() => ({
    status: 409,
    body: { error: "integration not connected" },
  }));
  await expect(run(execute, { action: "X" })).rejects.toThrow(
    /connect their apps/i,
  );
});

test("C2: attaches the turn's acting-as header inside a turn, and nothing outside one", async () => {
  // Inside a turn that received an acting-as token, the tool forwards it.
  const inTurn = mockFetch(() => ({ body: { items: [] } }));
  await runWithActingContext({ actingAs: "acting-v1.tok" }, () =>
    run(search, { query: "x" }),
  );
  expect(inTurn[0]?.headers["x-houston-acting-as"]).toBe("acting-v1.tok");
  expect(inTurn[0]?.headers["x-houston-acting-user"]).toBeUndefined();

  // A routine turn forwards the acting-user instead.
  const routine = mockFetch(() => ({ body: { successful: true } }));
  await runWithActingContext({ actingUser: "sub-alice" }, () =>
    run(execute, { action: "X" }),
  );
  expect(routine[0]?.headers["x-houston-acting-user"]).toBe("sub-alice");
  expect(routine[0]?.headers["x-houston-acting-as"]).toBeUndefined();

  // A call with NO turn context attaches neither header — today's behavior.
  const bare = mockFetch(() => ({ body: { items: [] } }));
  await run(search, { query: "x" });
  expect(bare[0]?.headers["x-houston-acting-as"]).toBeUndefined();
  expect(bare[0]?.headers["x-houston-acting-user"]).toBeUndefined();
});
