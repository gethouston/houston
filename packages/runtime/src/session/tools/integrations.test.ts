import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import { runWithActingContext } from "../acting-context";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import { runWithTurnMode } from "../turn-mode-context";
import { makeIntegrationTools } from "./integrations";
import { httpSandboxFetch } from "./sandbox-fetch";

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

const [search, execute, requestConnection] = makeIntegrationTools({
  call: httpSandboxFetch("https://host.test/", "sb-tok"),
});
if (!search || !execute || !requestConnection)
  throw new Error("expected three integration tools");

const ctx = {} as unknown as ExtensionToolContext;
const run = (tool: typeof search, params: unknown) =>
  tool.execute("id", params as never, undefined, undefined, ctx);

test("returns the generic tools plus request_connection, correctly named", () => {
  expect([search.name, execute.name, requestConnection.name]).toEqual([
    "integration_search",
    "integration_execute",
    "request_connection",
  ]);
});

test("search leads with account descriptions and the account-selection rule; execute keeps one sentence of it", async () => {
  mockFetch(() => ({
    body: {
      items: [
        {
          action: "GOOGLEDRIVE_LIST_FILES",
          toolkit: "googledrive",
          description: "List files",
          accounts: [{ id: "ca_1", createdAt: "2026-07-28" }, { id: "ca_2" }],
        },
      ],
    },
  }));
  const out = await run(search, { query: "list drive files" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain("ca_1 (connected on July 28, 2026), ca_2 (account 2)");
  for (const guidance of [
    "always pass `account`; never omit it",
    "you MUST ask ONE ask_user question before acting",
    "never ask when the app has a single account",
  ]) {
    expect(text).toContain(guidance);
  }
  expect(text.indexOf("MULTIPLE accounts")).toBeLessThan(
    text.indexOf("GOOGLEDRIVE_LIST_FILES"),
  );
  expect(execute.description).toContain(
    "always pass `account`; when the right one is unclear, ask the user before acting, and never guess.",
  );
  expect(execute.description).not.toContain("you MUST ask ONE ask_user");
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
  expect(text).toContain("request_connection tool");
  expect(text).not.toContain("#houston_toolkit=");
  expect(text).not.toContain("](https://");
});

test("a connectable toolkit-level entry names the slug and teaches request_connection", async () => {
  mockFetch(() => ({
    body: {
      items: [
        {
          action: "",
          toolkit: "googlesheets",
          description: "Google Sheets: Spreadsheets",
          connected: false,
          status: "connectable",
        },
      ],
    },
  }));
  const out = await run(search, { query: "connect to google sheets" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain("- googlesheets (app, NOT CONNECTED): Google Sheets");
  expect(text).toContain("not connected yet (googlesheets)");
  expect(text).toContain("request_connection tool");
});

test("a blocked app points the user at the agent's Settings Apps section and never offers request_connection", async () => {
  mockFetch(() => ({
    body: {
      items: [
        {
          action: "",
          toolkit: "salesforce",
          description: "Salesforce",
          connected: false,
          status: "blocked",
        },
      ],
    },
  }));
  const out = await run(search, { query: "salesforce" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain("- salesforce (app, TURNED OFF): Salesforce");
  expect(text).toContain("turned off for this agent");
  expect(text).toContain("this agent's Settings, under Apps");
  expect(text).not.toContain("admin");
  expect(text).toContain("Do NOT call request_connection");
  expect(text).toContain("never imply they are unsupported");
  expect(text).not.toContain("not connected yet");
});

test("an empty result is a genuine not-found, not a policy block", async () => {
  mockFetch(() => ({ body: { items: [] } }));
  const out = await run(search, { query: "flibbertigibbet" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain("No matching app or action found");
  expect(text).toContain("genuine not-found");
  expect(text).toContain("does NOT mean an app is blocked");
  expect(text).not.toContain("request_connection");
});

test("search forwards the app scope to the host and omits it when unset (PRODUCT-1274)", async () => {
  const calls = mockFetch(() => ({ body: { items: [] } }));
  await run(search, { query: "get the top users", app: "posthog" });
  await run(search, { query: "get the top users" });
  expect(calls[0]?.body).toEqual({
    query: "get the top users",
    app: "posthog",
  });
  expect(calls[1]?.body).toEqual({ query: "get the top users" });
});

test("an unscoped-fallback result leads with the named-app-not-found note", async () => {
  mockFetch(() => ({
    body: {
      items: [
        {
          action: "GMAIL_SEND_EMAIL",
          toolkit: "gmail",
          description: "Send an email",
          connected: true,
          status: "connected",
        },
      ],
      unscopedFallback: true,
    },
  }));
  const out = await run(search, { query: "send an email", app: "gmial" });
  const text = (out.content[0] as { text: string }).text;
  expect(text.startsWith('NOTE: no app matching "gmial" exists here')).toBe(
    true,
  );
  expect(text).toContain("OTHER apps");
  expect(text).toContain("GMAIL_SEND_EMAIL");
});

test("an empty APP-SCOPED result says the app was not found, with one spelling retry", async () => {
  mockFetch(() => ({ body: { items: [] } }));
  const out = await run(search, { query: "top users", app: "postohg" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain('No app matching "postohg"');
  expect(text).toContain("genuine not-found");
  expect(text).toContain("misspelled");
  expect(text).not.toContain("search again with `app`");
});

test("an empty UNSCOPED result tells the model to retry scoped before concluding", async () => {
  mockFetch(() => ({ body: { items: [] } }));
  const out = await run(search, { query: "in posthog get top users" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain("search again with `app` set to that app");
});

test("a scope-ignored result leads with the could-not-scope note, never the not-found claim", async () => {
  mockFetch(() => ({
    body: {
      items: [
        {
          action: "GITHUB_LIST_REPOS",
          toolkit: "github",
          description: "List repositories",
          connected: true,
          status: "connected",
        },
      ],
      scopeIgnored: true,
    },
  }));
  const out = await run(search, { query: "get top users", app: "posthog" });
  const text = (out.content[0] as { text: string }).text;
  expect(text.startsWith("NOTE: this Houston deployment could not scope")).toBe(
    true,
  );
  expect(text).toContain("OTHER apps");
  expect(text).not.toContain("no app matching");
});

test("an EMPTY scope-ignored result never claims the app does not exist", async () => {
  mockFetch(() => ({ body: { items: [], scopeIgnored: true } }));
  const out = await run(search, { query: "churn deltas", app: "posthog" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain("could not verify the app scope");
  expect(text).toContain("proves NOTHING");
  expect(text).not.toContain("genuine not-found");
  expect(text).not.toContain("no such app exists");
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

test.each(
  [
    "Invalid request data provided",
    "Following fields are missing: recipients",
    "Input should be 'SET' or 'CLEAR'",
    "Unsupported field text: use markdown_text",
    "Field required",
    "Extra inputs are not permitted",
    "value is not a valid integer",
    "Input should be a valid dictionary or object to extract fields from on parameter `sorts.N`",
  ].flatMap((error) =>
    [200, 500].flatMap((status) =>
      ["GOOGLE_MAPS_SEARCH", "tools.croma.org.default.op1"].map((action) => ({
        error,
        status,
        action,
      })),
    ),
  ),
)("parameter rejection gives exact recovery for $action, HTTP $status: $error", async ({
  error,
  status,
  action,
}) => {
  mockFetch(() => ({ status, body: { successful: false, error } }));
  const failure = run(execute, { action, params: {} });
  await expect(failure).rejects.toThrow(error);
  await expect(failure).rejects.toThrow(
    `the exact action name "${action}" as \`query\``,
  );
  await expect(failure).rejects.toThrow(
    "the app the action belongs to (as shown next to it in your earlier search results)",
  );
  await expect(failure).rejects.toThrow("retry with corrected arguments");
  await expect(failure).rejects.toThrow(
    "Never mention slugs or technical details to the user",
  );
  await expect(failure).rejects.not.toThrow("request_connection");
  await expect(failure).rejects.not.toThrow("first result");
});

test("a thrown parameter rejection retains its original error as the cause", async () => {
  const original = new Error("Invalid request data provided: recipients");
  const tools = makeIntegrationTools({
    call: async () => {
      throw original;
    },
  });
  const tool = tools.find((tool) => tool.name === "integration_execute");
  if (!tool) throw new Error("missing execute tool");
  await expect(
    run(tool, { action: "GMAIL_FORWARD_MESSAGE" }),
  ).rejects.toMatchObject({ cause: original });
});

test.each([
  "Slack API error: channel_not_found",
  "Quota exceeded for this app",
])("unrelated execute errors get no parameter hint: %s", async (error) => {
  for (const status of [200, 500]) {
    mockFetch(() => ({ status, body: { successful: false, error } }));
    const failure = run(execute, { action: "SLACK_SEND_MESSAGE" });
    await expect(failure).rejects.toThrow(error);
    await expect(failure).rejects.not.toThrow("integration_search");
  }
});

test("an exact MCP lookup recovers a required parameter beyond the broad signature", async () => {
  const action = "tools.croma.org.default.op1";
  const inputParams = {
    required: [
      ...Array.from({ length: 45 }, (_, i) => `field_${i}`),
      "required_last",
    ],
    properties: {
      ...Object.fromEntries(
        Array.from({ length: 45 }, (_, i) => [
          `field_${i}`,
          { type: "string", description: "Description ".repeat(20) },
        ]),
      ),
      required_last: {
        type: "integer",
        description: "The required identifier",
      },
    },
  };
  const target = {
    action,
    toolkit: "croma",
    description: "Lookup",
    inputParams,
  };
  mockFetch(() => ({ body: { items: [target, target, target] } }));
  const broad = await run(search, { app: "croma", query: "lookup records" });
  const tail = broad.content.filter((part) => part.type === "text").at(-1);
  expect(
    tail?.type === "text" && tail.text.split(`- ${action}`).at(-1),
  ).not.toContain("required_last");
  const calls = mockFetch(() => ({ body: { items: [target] } }));
  const exact = await run(search, { app: "croma", query: action });
  expect(calls[0]?.body).toEqual({ app: "croma", query: action });
  const text = exact.content.find((part) => part.type === "text");
  expect(text?.type === "text" && text.text).toContain(
    "\n    field_44: string",
  );
  expect(text?.type === "text" && text.text).toContain(
    "\n    required_last: integer",
  );
});

test("a giant execute result is truncated with recovery guidance, never fed whole", async () => {
  mockFetch(() => ({
    body: { successful: true, data: { html: "x".repeat(1_200_000) } },
  }));
  const out = await run(execute, {
    action: "GMAIL_FETCH_EMAILS",
    params: { include_payload: true },
  });
  const text = (out.content[0] as { text: string }).text;
  expect(text.length).toBeLessThan(514 * 1024);
  expect(text).toContain("[result truncated");
  expect(text).toContain("Re-run the action with tighter parameters");
});

test("an execute result comes back one record per line, without indent padding", async () => {
  const a = "a".repeat(300);
  const b = "b".repeat(300);
  mockFetch(() => ({
    body: {
      successful: true,
      data: {
        messages: [
          { id: "m1", subject: a },
          { id: "m2", subject: b },
        ],
        next: "t",
      },
    },
  }));
  const out = await run(execute, { action: "GMAIL_FETCH_EMAILS", params: {} });
  expect((out.content[0] as { text: string }).text).toBe(
    `{\n "messages": [\n  {"id":"m1","subject":"${a}"},\n  {"id":"m2","subject":"${b}"}\n ],\n "next": "t"\n}`,
  );
});

test("a small execute result passes through untouched", async () => {
  mockFetch(() => ({ body: { successful: true, data: { ok: 1 } } }));
  const out = await run(execute, { action: "X", params: {} });
  expect((out.content[0] as { text: string }).text).not.toContain(
    "[result truncated",
  );
});

test("a no-connected-account failure hands off to request_connection", async () => {
  mockFetch(() => ({
    body: { successful: false, error: "no connected account found for user" },
  }));
  const failure = run(execute, { action: "GMAIL_SEND_EMAIL", params: {} });
  await expect(failure).rejects.toThrow(/has not connected this app/);
  await expect(failure).rejects.toThrow(/request_connection tool/);
  await expect(failure).rejects.not.toThrow(/#houston_toolkit=/);
  await expect(failure).rejects.not.toThrow(/integration_search/);

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
  expect(holder.pending).toEqual({
    steps: [
      {
        kind: "connect",
        id: "c1",
        toolkit: "gmail",
        reason: "to send your email",
      },
    ],
  });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/end your turn/i);
  expect(text).not.toContain("#houston_toolkit=");
});

test("request_connection omits an empty reason and rejects an empty slug", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run(requestConnection, { toolkit: "slack" }),
  );
  expect(holder.pending).toEqual({
    steps: [{ kind: "connect", id: "c1", toolkit: "slack" }],
  });

  await runWithInteractionCapture(newInteractionHolder(), () =>
    expect(run(requestConnection, { toolkit: "   " })).rejects.toThrow(
      /non-empty toolkit/i,
    ),
  );
});

test("request_connection records nothing outside a turn (no ambient holder)", async () => {
  await expect(
    run(requestConnection, { toolkit: "gmail" }),
  ).resolves.toBeDefined();
});

test("a 409 (signed out) queues a signin step and tells the model to end its turn", async () => {
  mockFetch(() => ({
    status: 409,
    body: { error: "signin_required", code: "signin_required" },
  }));
  const holder = newInteractionHolder();
  const failure = runWithInteractionCapture(holder, () =>
    run(execute, { action: "X" }),
  );
  await expect(failure).rejects.toThrow(/signed out of Houston/i);
  await expect(failure).rejects.toThrow(/end your turn/i);
  await expect(failure).rejects.toThrow(
    /Do NOT tell the user to open Settings/,
  );
  expect(holder.pending).toEqual({
    steps: [
      {
        kind: "signin",
        id: "s1",
        reason: "Sign in to Houston to use your connected apps.",
      },
    ],
  });
});

test("an expired turn grant refuses without queuing signin or suggesting retry", async () => {
  mockFetch(() => ({
    status: 401,
    body: { error: "turn grant expired", code: "grant_expired" },
  }));
  const holder = newInteractionHolder();
  const failure = runWithInteractionCapture(holder, () =>
    run(execute, { action: "GMAIL_SEND_EMAIL" }),
  );
  await expect(failure).rejects.toThrow(/access expired/i);
  await expect(failure).rejects.toThrow(/Do not retry/i);
  expect(holder.pending).toBeUndefined();
});

test("a 503 (not set up) is an honest, closed message and queues nothing", async () => {
  mockFetch(() => ({
    status: 503,
    body: {
      error: "integrations not configured",
      code: "integrations_not_configured",
    },
  }));
  const holder = newInteractionHolder();
  const failure = runWithInteractionCapture(holder, () =>
    run(execute, { action: "X" }),
  );
  await expect(failure).rejects.toThrow(/not set up in this Houston install/i);
  await expect(failure).rejects.toThrow(/COMPOSIO_API_KEY/);
  await expect(failure).rejects.not.toThrow(/workspace/i);
  expect(holder.pending).toBeUndefined();
});

test("a RELAYED upstream 503 (transient outage) is NOT the not-set-up message", async () => {
  mockFetch(() => ({
    status: 503,
    body: { error: "upstream temporarily unavailable" },
  }));
  const holder = newInteractionHolder();
  const failure = runWithInteractionCapture(holder, () =>
    run(execute, { action: "X" }),
  );
  await expect(failure).rejects.toThrow(/integrations execute failed \(503\)/);
  await expect(failure).rejects.not.toThrow(
    /not set up in this Houston install/i,
  );
  await expect(failure).rejects.not.toThrow(/COMPOSIO_API_KEY/);
  expect(holder.pending).toBeUndefined();
});

test("a RELAYED upstream 409 (transient conflict) queues NO signin card", async () => {
  mockFetch(() => ({
    status: 409,
    body: { error: "conflict: resource busy" },
  }));
  const holder = newInteractionHolder();
  const failure = runWithInteractionCapture(holder, () =>
    run(execute, { action: "X" }),
  );
  await expect(failure).rejects.toThrow(/integrations execute failed \(409\)/);
  await expect(failure).rejects.not.toThrow(/signed out of Houston/i);
  await expect(failure).rejects.not.toThrow(/end your turn/i);
  expect(holder.pending).toBeUndefined();
});

test("execute POSTs the action + params only (no confirmation intent)", async () => {
  const calls = mockFetch(() => ({ body: { successful: true } }));
  await run(execute, {
    action: "GMAIL_SEND_EMAIL",
    params: { to: "a@b.com" },
  });
  expect(calls[0]?.body).toEqual({
    action: "GMAIL_SEND_EMAIL",
    params: { to: "a@b.com" },
  });

  const reads = mockFetch(() => ({ body: { successful: true } }));
  await run(execute, { action: "GMAIL_LIST_MESSAGES" });
  expect(reads[0]?.body).toEqual({ action: "GMAIL_LIST_MESSAGES", params: {} });
});

test("a 409 (approval_required) is no longer special: it surfaces as a generic error", async () => {
  mockFetch(() => ({
    status: 409,
    body: {
      error: "approval required",
      code: "approval_required",
      approval: {
        toolkit: "gmail",
        action: "GMAIL_SEND_EMAIL",
        paramsHash: "h7f3a1",
      },
    },
  }));
  const holder = newInteractionHolder();
  const failure = runWithInteractionCapture(holder, () =>
    run(execute, { action: "GMAIL_SEND_EMAIL", params: { to: "a@b.com" } }),
  );
  await expect(failure).rejects.toThrow(
    /integrations execute failed \(409, code approval_required\)/,
  );
  await expect(failure).rejects.not.toThrow(/paramsHash|h7f3a1/);
  expect(holder.pending).toBeUndefined();
});

test("a 403 (toolkit_not_allowed) returns Settings Apps guidance, not a raw error", async () => {
  mockFetch(() => ({
    status: 403,
    body: {
      error: "salesforce is not an allowed integration for this agent",
      code: "toolkit_not_allowed",
    },
  }));
  const holder = newInteractionHolder();
  const out = await runWithInteractionCapture(holder, () =>
    run(execute, {
      action: "SALESFORCE_CREATE_LEAD",
      params: { name: "Acme" },
    }),
  );
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain("turned off for this agent");
  expect(text).toContain("this agent's Settings, under Apps");
  expect(text).toContain("Do not retry");
  expect(text).toContain("never imply the app is unsupported");
  expect(text).not.toContain("admin");
  expect(out.details).toEqual({
    action: "SALESFORCE_CREATE_LEAD",
    appTurnedOff: true,
  });
  expect(holder.pending).toBeUndefined();
});

test("a 403 (not_assigned) returns access guidance on BOTH search and execute, never the gateway's words", async () => {
  const notAssigned = () => ({
    status: 403,
    body: { error: "this agent isn't assigned to you", code: "not_assigned" },
  });
  const holder = newInteractionHolder();

  mockFetch(notAssigned);
  const found = await runWithInteractionCapture(holder, () =>
    run(search, { query: "send an email" }),
  );
  mockFetch(notAssigned);
  const ran = await runWithInteractionCapture(holder, () =>
    run(execute, { action: "GMAIL_SEND_EMAIL", params: { to: "a@b.com" } }),
  );

  for (const out of [found, ran]) {
    const text = (out.content[0] as { text: string }).text;
    expect(text).toContain("does not have access to this agent");
    expect(text).toContain("Settings");
    expect(text).toContain("People");
    expect(text).toContain("Do not retry");
    expect(text).toContain("never imply the app they asked for is unsupported");
    expect(text).not.toContain("not_assigned");
    expect(text).not.toContain("assigned");
    expect(text).not.toContain("{");
    expect(text).not.toContain("403");
  }
  expect(found.details).toEqual({
    matches: 0,
    actions: [],
    noAgentAccess: true,
  });
  expect(ran.details).toEqual({
    action: "GMAIL_SEND_EMAIL",
    noAgentAccess: true,
  });
  expect(holder.pending).toBeUndefined();
});

test("an unrecognized 4xx redacts the response body, keeping only status + code", async () => {
  mockFetch(() => ({
    status: 422,
    body: {
      error: "tenant xyz-9 exceeded seat_policy for org 41f",
      code: "seat_policy_violation",
    },
  }));
  const failure = run(execute, { action: "GMAIL_SEND_EMAIL" });
  await expect(failure).rejects.toThrow(
    /integrations execute failed \(422, code seat_policy_violation\)/,
  );
  await expect(failure).rejects.toThrow(/never quote this message/);
  await expect(failure).rejects.not.toThrow(/tenant xyz-9/);
  await expect(failure).rejects.not.toThrow(/seat_policy for org/);
  await expect(failure).rejects.not.toThrow(/[{}]/);

  mockFetch(() => ({ status: 400, body: { error: "bad query for org 41f" } }));
  const searchFailure = run(search, { query: "x" });
  await expect(searchFailure).rejects.toThrow(
    /integrations search failed \(400\)\./,
  );
  await expect(searchFailure).rejects.not.toThrow(/bad query/);
});

test("a RELAYED upstream 403 (no code) stays a generic error, not the turned-off guidance", async () => {
  mockFetch(() => ({ status: 403, body: { error: "forbidden by upstream" } }));
  await expect(run(execute, { action: "X" })).rejects.toThrow(
    /integrations execute failed \(403\)/,
  );
});

test("a stale action slug (Tool_ToolNotFound via the gateway's 502) returns re-search guidance, not a raw failure", async () => {
  mockFetch(() => ({
    status: 502,
    body: {
      error:
        'composio POST /api/v3/tools/execute/GMAIL_SEARCH_EMAILS → 404: {"error":{"message":"Tool GMAIL_SEARCH_EMAILS not found","code":2401,"slug":"Tool_ToolNotFound","status":404,"suggested_fix":"Check your input."}}',
    },
  }));
  const holder = newInteractionHolder();
  const out = await runWithInteractionCapture(holder, () =>
    run(execute, { action: "GMAIL_SEARCH_EMAILS", params: { query: "x" } }),
  );
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain('"GMAIL_SEARCH_EMAILS" does not exist');
  expect(text).toContain("Call integration_search now");
  expect(text).toContain("Do not retry this slug");
  expect(text).not.toContain("Tool_ToolNotFound");
  expect(text).not.toContain("502");
  expect(text).not.toContain("404");
  expect(out.details).toEqual({
    action: "GMAIL_SEARCH_EMAILS",
    actionNotFound: true,
  });
  expect(holder.pending).toBeUndefined();
});

test("a stale action slug via the DIRECT adapter's 500 classifies identically", async () => {
  mockFetch(() => ({
    status: 500,
    body: {
      error:
        'composio POST /api/v3/tools/execute/OLD_ACTION → 404: {"error":{"slug":"Tool_ToolNotFound","code":2401}}',
    },
  }));
  const out = await run(execute, { action: "OLD_ACTION" });
  expect((out.content[0] as { text: string }).text).toContain(
    "Call integration_search now",
  );
  expect(out.details).toEqual({ action: "OLD_ACTION", actionNotFound: true });
});

test("a plain relayed 502 WITHOUT the Composio slug stays a generic transient error", async () => {
  mockFetch(() => ({
    status: 502,
    body: { error: "upstream connect timeout" },
  }));
  await expect(run(execute, { action: "X" })).rejects.toThrow(
    /integrations execute failed \(502\)/,
  );
});

test("live mode gates: a turn switched to Plan refuses execute and the connect hand-off", async () => {
  const calls = mockFetch(() => ({ body: { successful: true } }));
  await expect(
    runWithTurnMode({ current: "plan" }, () => run(execute, { action: "X" })),
  ).rejects.toThrow(/Plan mode/);
  expect(calls).toHaveLength(0);

  await expect(
    runWithTurnMode({ current: "plan" }, () =>
      run(requestConnection, { toolkit: "gmail" }),
    ),
  ).rejects.toThrow(/Plan mode/);
});

test("Autopilot does NOT gate request_connection: the connect step is recorded (HOU-853)", async () => {
  const holder = newInteractionHolder();
  await runWithTurnMode({ current: "auto" }, () =>
    runWithInteractionCapture(holder, () =>
      run(requestConnection, { toolkit: "gmail", reason: "to send email" }),
    ),
  );
  expect(holder.pending).toEqual({
    steps: [
      { kind: "connect", id: "c1", toolkit: "gmail", reason: "to send email" },
    ],
  });
});

test("C2: attaches the turn's acting-as header inside a turn, and nothing outside one", async () => {
  const inTurn = mockFetch(() => ({ body: { items: [] } }));
  await runWithActingContext({ actingAs: "acting-v1.tok" }, () =>
    run(search, { query: "x" }),
  );
  expect(inTurn[0]?.headers["x-houston-acting-as"]).toBe("acting-v1.tok");
  expect(inTurn[0]?.headers["x-houston-acting-user"]).toBeUndefined();

  const routine = mockFetch(() => ({ body: { successful: true } }));
  await runWithActingContext({ actingUser: "sub-alice" }, () =>
    run(execute, { action: "X" }),
  );
  expect(routine[0]?.headers["x-houston-acting-user"]).toBe("sub-alice");
  expect(routine[0]?.headers["x-houston-acting-as"]).toBeUndefined();

  const bare = mockFetch(() => ({ body: { items: [] } }));
  await run(search, { query: "x" });
  expect(bare[0]?.headers["x-houston-acting-as"]).toBeUndefined();
  expect(bare[0]?.headers["x-houston-acting-user"]).toBeUndefined();
});
