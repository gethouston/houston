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

const [search, execute, requestConnection] = makeIntegrationTools({
  baseUrl: "https://host.test/",
  sandboxToken: "sb-tok",
});
if (!search || !execute || !requestConnection)
  throw new Error("expected three integration tools");

// pi's tool.execute takes (id, params, signal, onUpdate, ctx); the last two are
// irrelevant to these proxies, so one helper supplies them.
const ctx = {} as unknown as ExtensionContext;
const run = (tool: typeof search, params: unknown) =>
  tool.execute("id", params as never, undefined, undefined, ctx);

test("returns the generic tools plus request_connection, correctly named", () => {
  expect([search.name, execute.name, requestConnection.name]).toEqual([
    "integration_search",
    "integration_execute",
    "request_connection",
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

test("a connectable toolkit-level entry names the slug and teaches request_connection", async () => {
  // Catalog resolution surfaces the app itself (empty action) so the model
  // learns the slug even when no action scored — the Google Sheets bug.
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
  // The app row (not an action row) names the slug.
  expect(text).toContain("- googlesheets (app, NOT CONNECTED): Google Sheets");
  // And the connect hand-off is taught, naming the connectable slug.
  expect(text).toContain("not connected yet (googlesheets)");
  expect(text).toContain("request_connection tool");
});

test("a blocked app sends the user to their admin and never offers request_connection", async () => {
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
  expect(text).toContain("- salesforce (app, BLOCKED by admin): Salesforce");
  expect(text).toContain("admin has not enabled these apps");
  expect(text).toContain("ask their admin");
  // The guidance explicitly forbids the connect card for a blocked app.
  expect(text).toContain("Do NOT call request_connection");
  // And it never offers to connect it (no "not connected yet" connect prompt).
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
    steps: [
      {
        kind: "connect",
        id: "c1",
        toolkit: "gmail",
        reason: "to send your email",
      },
    ],
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
  // No runWithInteractionCapture wrapper → recordConnection is a no-op,
  // so a direct call still succeeds and simply records nowhere.
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
  // The guidance tells the model NOT to send the user to Settings.
  await expect(failure).rejects.toThrow(
    /Do NOT tell the user to open Settings/,
  );
  // The signin step is queued in this turn's interaction flow, id "s1".
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
  // A closed state: no sign-in card, no connect offer, and never "workspace".
  await expect(failure).rejects.not.toThrow(/workspace/i);
  expect(holder.pending).toBeUndefined();
});

test("a RELAYED upstream 503 (transient outage) is NOT the not-set-up message", async () => {
  // The host's sandbox proxy relays ANY non-ok upstream status verbatim. In
  // gateway mode a transient Composio/gateway outage returns 503 with the
  // upstream's body (NO integrations_not_configured code) — the key IS set, so
  // the model must NOT tell the user "connected apps aren't set up here / set
  // COMPOSIO_API_KEY". It is a generic transient failure.
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
  // Symmetric to the 503 case: an upstream 409 the host relays verbatim lacks
  // the signin_required code, so it must NOT record a sign-in step nor tell the
  // model to end its turn.
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

test("multi-provider: the search stamp routes execute and request_connection", async () => {
  // Fresh tools: the provider memory is per-makeIntegrationTools instance.
  const [s, e, rc] = makeIntegrationTools({
    baseUrl: "https://host.test/",
    sandboxToken: "sb-tok",
  });
  if (!s || !e || !rc) throw new Error("expected three integration tools");

  const calls = mockFetch((path) => {
    if (path.endsWith("/search")) {
      return {
        body: {
          items: [
            {
              action: "COMPOSIO_MULTI_EXECUTE_TOOL",
              toolkit: "composio-apps",
              description: "run a tool",
              connected: true,
              status: "connected",
              provider: "composio-apps",
            },
            {
              action: "",
              toolkit: "slack",
              description: "Slack",
              connected: false,
              status: "connectable",
              provider: "composio",
            },
          ],
        },
      };
    }
    return { body: { successful: true, data: { ok: 1 } } };
  });

  await run(s, { query: "run a tool" });
  await run(e, { action: "COMPOSIO_MULTI_EXECUTE_TOOL", params: {} });
  // The execute call echoes the provider stamped on the search result.
  const exec = calls.find((c) => c.url.endsWith("/execute"));
  expect(exec?.body).toMatchObject({
    action: "COMPOSIO_MULTI_EXECUTE_TOOL",
    provider: "composio-apps",
  });

  // The connect step carries the toolkit's provider so the app's card
  // connects through the right one.
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () => run(rc, { toolkit: "Slack" }));
  expect(holder.pending).toEqual({
    steps: [
      { kind: "connect", id: "c1", toolkit: "slack", provider: "composio" },
    ],
  });
});

test("multi-provider: an unstamped action omits provider (host default routing)", async () => {
  const [s, e] = makeIntegrationTools({
    baseUrl: "https://host.test/",
    sandboxToken: "sb-tok",
  });
  if (!s || !e) throw new Error("expected tools");
  const calls = mockFetch((path) =>
    path.endsWith("/search")
      ? {
          body: {
            items: [
              {
                action: "GMAIL_SEND_EMAIL",
                toolkit: "gmail",
                description: "send",
                connected: true,
              },
            ],
          },
        }
      : { body: { successful: true } },
  );
  await run(s, { query: "email" });
  await run(e, { action: "GMAIL_SEND_EMAIL", params: {} });
  const exec = calls.find((c) => c.url.endsWith("/execute"));
  expect(exec?.body).toEqual({ action: "GMAIL_SEND_EMAIL", params: {} });
});
