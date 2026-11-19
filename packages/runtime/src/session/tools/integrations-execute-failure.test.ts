import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import {
  newInteractionHolder,
  recordConnection,
  runWithInteractionCapture,
} from "../interaction";
import { makeIntegrationTools } from "./integrations";
import { httpSandboxFetch } from "./sandbox-fetch";

/**
 * integration_execute on a refusal no retry can fix: the failure names the
 * class's way forward, and a dead login queues the reconnect card.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function reply(byPath: Record<string, unknown>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const body = byPath[new URL(String(input)).pathname];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

const tools = () => {
  const [search, execute] = makeIntegrationTools({
    call: httpSandboxFetch("https://host.test/", "sb-tok"),
  });
  if (!search || !execute) throw new Error("expected integration tools");
  const ctx = {} as unknown as ExtensionToolContext;
  const run = (tool: typeof search, params: unknown) =>
    tool.execute("id", params as never, undefined, undefined, ctx);
  return { search, execute, run };
};

const EXECUTE = "/sandbox/integrations/execute";
const SEARCH = "/sandbox/integrations/search";
const APIFY_DEAD =
  "API request failed with status 401: User was not found or authentication token is not valid";

test("a dead login fails with reconnect guidance and queues a reconnect step", async () => {
  const { execute, run } = tools();
  reply({ [EXECUTE]: { successful: false, error: APIFY_DEAD } });
  const holder = newInteractionHolder();
  const failure = runWithInteractionCapture(holder, () =>
    run(execute, { action: "APIFY_ACT_RUNS_LAST_GET", params: {} }),
  );
  await expect(failure).rejects.toThrow(
    /did not succeed: API request failed with status 401/,
  );
  await expect(failure).rejects.toThrow(
    /do not call any apify action again until the user reconnects/,
  );
  expect(holder.pending).toEqual({
    steps: [{ kind: "connect", id: "c1", toolkit: "apify", reconnect: true }],
  });
});

test("the reconnect step names the toolkit search reported, not the slug prefix", async () => {
  const { search, execute, run } = tools();
  reply({
    [SEARCH]: {
      items: [
        {
          action: "HIGHLEVEL_MCP_CONVERSATIONS_SEND_A_NEW_MESSAGE",
          toolkit: "highlevel_mcp",
          description: "Send a message",
        },
      ],
    },
    [EXECUTE]: {
      successful: false,
      error: "Request had invalid authentication credentials.",
    },
  });
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await run(search, { query: "send a message", app: "highlevel" });
    await expect(
      run(execute, {
        action: "HIGHLEVEL_MCP_CONVERSATIONS_SEND_A_NEW_MESSAGE",
        params: {},
      }),
    ).rejects.toThrow(/highlevel_mcp connection no longer works/);
  });
  expect(holder.pending?.steps).toEqual([
    { kind: "connect", id: "c1", toolkit: "highlevel_mcp", reconnect: true },
  ]);
});

test("Slack feature_not_enabled points at SLACK_SEARCH_MESSAGES and queues nothing", async () => {
  const { execute, run } = tools();
  reply({
    [EXECUTE]: {
      successful: false,
      error: "Slack API error: feature_not_enabled",
    },
  });
  const holder = newInteractionHolder();
  const failure = runWithInteractionCapture(holder, () =>
    run(execute, { action: "SLACK_ASSISTANT_SEARCH_CONTEXT", params: {} }),
  );
  await expect(failure).rejects.toThrow(/use SLACK_SEARCH_MESSAGES instead/);
  expect(holder.pending).toBeUndefined();
});

test("a Notion page not shared asks the user to share it, no card", async () => {
  const { execute, run } = tools();
  reply({
    [EXECUTE]: {
      successful: false,
      error:
        'Page not found (404): Could not find page with ID: <uuid>. Make sure the relevant pages and databases are shared with your integration "Composio".',
    },
  });
  const holder = newInteractionHolder();
  const failure = runWithInteractionCapture(holder, () =>
    run(execute, { action: "NOTION_RETRIEVE_PAGE", params: {} }),
  );
  await expect(failure).rejects.toThrow(/choose Connections and add Composio/);
  expect(holder.pending).toBeUndefined();
});

test("a reconnect sticks to an app the model already asked to connect", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    recordConnection({ toolkit: "apify", reason: "To run your scrapers." });
    recordConnection({ toolkit: "apify", reconnect: true });
    recordConnection({ toolkit: "apify", reason: "To check the last run." });
  });
  expect(holder.pending?.steps).toEqual([
    {
      kind: "connect",
      id: "c1",
      toolkit: "apify",
      reason: "To check the last run.",
      reconnect: true,
    },
  ]);
});
