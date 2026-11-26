import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import { runWithConversationId } from "../conversation-context";
import {
  newInteractionHolder,
  recordConnection,
  runWithInteractionCapture,
} from "../interaction";
import { makeIntegrationTools } from "./integrations";
import { httpSandboxFetch } from "./sandbox-fetch";

/**
 * integration_execute on a refusal no retry can fix: the failure names the
 * class's way forward, and a dead login queues the reconnect card: only for a
 * toolkit integration_search named, and once per conversation.
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

const EXECUTE = "/sandbox/integrations/execute";
const SEARCH = "/sandbox/integrations/search";
const APIFY_DEAD =
  "API request failed with status 401: User was not found or authentication token is not valid";
const APIFY_ACTION = "APIFY_ACT_RUNS_LAST_GET";
const APIFY_SEARCH = {
  items: [{ action: APIFY_ACTION, toolkit: "apify", description: "Last run" }],
};

const tools = (ctx = {} as ExtensionToolContext) => {
  const [search, execute] = makeIntegrationTools({
    call: httpSandboxFetch("https://host.test/", "sb-tok"),
  });
  if (!search || !execute) throw new Error("expected integration tools");
  const run = (tool: typeof search, params: unknown) =>
    tool.execute("id", params as never, undefined, undefined, ctx);
  return { search, execute, run };
};

/** One turn of `conversation`: search Apify, then hit the dead login. */
async function deadApifyTurn(
  conversation: string,
  ctx?: ExtensionToolContext,
): Promise<{ steps: unknown; error: string }> {
  const { search, execute, run } = tools(ctx);
  reply({
    [SEARCH]: APIFY_SEARCH,
    [EXECUTE]: { successful: false, error: APIFY_DEAD },
  });
  const holder = newInteractionHolder();
  let error = "";
  await runWithConversationId(conversation, () =>
    runWithInteractionCapture(holder, async () => {
      await run(search, { query: "last run", app: "apify" });
      await run(execute, { action: APIFY_ACTION, params: {} }).catch(
        (err: Error) => {
          error = err.message;
        },
      );
    }),
  );
  return { steps: holder.pending?.steps, error };
}

test("a dead login fails with reconnect guidance and queues a reconnect step", async () => {
  const { steps, error } = await deadApifyTurn("conv-first");
  expect(error).toMatch(/did not succeed: API request failed with status 401/);
  expect(error).toMatch(
    /do not call any apify action again until the user reconnects/,
  );
  expect(error).toContain("A reconnect step for apify was added");
  expect(steps).toEqual([
    {
      kind: "connect",
      id: "c1",
      toolkit: "apify",
      reconnect: true,
      refusedAt: expect.any(String),
    },
  ]);
});

test("a second refusal in the same turn keeps the one step", async () => {
  const { search, execute, run } = tools();
  reply({
    [SEARCH]: APIFY_SEARCH,
    [EXECUTE]: { successful: false, error: APIFY_DEAD },
  });
  const holder = newInteractionHolder();
  await runWithConversationId("conv-same-turn", () =>
    runWithInteractionCapture(holder, async () => {
      await run(search, { query: "last run", app: "apify" });
      for (let i = 0; i < 2; i++)
        await expect(
          run(execute, { action: APIFY_ACTION, params: {} }),
        ).rejects.toThrow(/A reconnect step for apify was added/);
    }),
  );
  expect(holder.pending?.steps).toHaveLength(1);
});

test("a later turn of the same conversation gets no second card (older clients loop)", async () => {
  await deadApifyTurn("conv-loop");
  const { steps, error } = await deadApifyTurn("conv-loop");
  expect(steps).toBeUndefined();
  expect(error).toContain("Integrations page");
  expect(error).toContain("Do not ask to connect it in chat");
  expect(error).not.toContain("A reconnect step");
});

test("the persisted transcript also counts as an earlier card", async () => {
  const earlier = (await deadApifyTurn("conv-transcript-a")).error;
  const ctx = {
    sessionManager: {
      getBranch: () => [
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: "integration_execute",
            content: [{ type: "text", text: earlier }],
          },
        },
      ],
    },
  } as unknown as ExtensionToolContext;
  // A process that never saw the first card (another sandbox, a restart).
  const { steps, error } = await deadApifyTurn("conv-transcript-b", ctx);
  expect(steps).toBeUndefined();
  expect(error).toContain("Integrations page");
});

test("a toolkit search never named gets guidance only, no card", async () => {
  const { execute, run } = tools();
  reply({
    [EXECUTE]: {
      successful: false,
      error: "Request had invalid authentication credentials.",
    },
  });
  const holder = newInteractionHolder();
  const failure = runWithConversationId("conv-unknown", () =>
    runWithInteractionCapture(holder, () =>
      run(execute, { action: "MICROSOFT_TEAMS_SEND_MESSAGE", params: {} }),
    ),
  );
  await expect(failure).rejects.toThrow(/Integrations page/);
  expect(holder.pending).toBeUndefined();
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
  await runWithConversationId("conv-highlevel", () =>
    runWithInteractionCapture(holder, async () => {
      await run(search, { query: "send a message", app: "highlevel" });
      await expect(
        run(execute, {
          action: "HIGHLEVEL_MCP_CONVERSATIONS_SEND_A_NEW_MESSAGE",
          params: {},
        }),
      ).rejects.toThrow(/highlevel_mcp connection no longer works/);
    }),
  );
  expect(holder.pending?.steps).toEqual([
    {
      kind: "connect",
      id: "c1",
      toolkit: "highlevel_mcp",
      reconnect: true,
      refusedAt: expect.any(String),
    },
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
    recordConnection({ toolkit: "apify", refusedAt: "2026-11-18T21:00:00Z" });
    recordConnection({ toolkit: "apify", reason: "To check the last run." });
  });
  expect(holder.pending?.steps).toEqual([
    {
      kind: "connect",
      id: "c1",
      toolkit: "apify",
      reason: "To check the last run.",
      reconnect: true,
      refusedAt: "2026-11-18T21:00:00Z",
    },
  ]);
});
