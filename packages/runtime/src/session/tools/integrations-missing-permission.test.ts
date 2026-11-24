import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import { runWithConversationId } from "../conversation-context";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import { makeIntegrationTools } from "./integrations";
import { httpSandboxFetch } from "./sandbox-fetch";

/**
 * integration_execute on a refusal for a permission the connection lacks: a
 * never-grantable Gmail settings write gets manual steps, any other Google
 * refusal queues ONE reconnect card per app per conversation (the guard dead
 * logins share), Slack is reconnected from
 * Integrations.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// The prod shape: Composio relays Google's 403 body verbatim.
const GOOGLE_SCOPE_403 = `{"error":{"code":403,"message":"Request had insufficient authentication scopes.","status":"PERMISSION_DENIED","details":[{"reason":"ACCESS_TOKEN_SCOPE_INSUFFICIENT"}]}}`;
const SLACK_MISSING_SCOPE = `{"ok":false,"error":"missing_scope","needed":"reactions:write"}`;

const EXECUTE = "/sandbox/integrations/execute";
const SEARCH = "/sandbox/integrations/search";

/** Search names `toolkit` for `action`; execute refuses with `error`. */
function refuseWith(error: string, action = "", toolkit = "") {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    const body =
      path === SEARCH
        ? { items: [{ action, toolkit, description: "x" }] }
        : path === EXECUTE
          ? { successful: false, error }
          : {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

let conversations = 0;

/**
 * A fresh conversation. Each call is one turn: search (so the toolkit is
 * known) unless `searchFirst` is false, then run the action; returns the
 * failure text and the steps the turn queued.
 */
function conversation() {
  const id = `conv-permission-${++conversations}`;
  return async (action: string, searchFirst = true) => {
    const [search, execute] = makeIntegrationTools({
      call: httpSandboxFetch("https://host.test/", "sb-tok"),
    });
    if (!search || !execute) throw new Error("expected integration tools");
    const ctx = {} as unknown as ExtensionToolContext;
    const holder = newInteractionHolder();
    let message = "";
    await runWithConversationId(id, () =>
      runWithInteractionCapture(holder, async () => {
        if (searchFirst)
          await search.execute("s", { query: "q" }, undefined, undefined, ctx);
        await execute.execute(
          "id",
          { action, params: {} },
          undefined,
          undefined,
          ctx,
        );
      }),
    ).catch((err: Error) => {
      message = err.message;
    });
    const steps = (holder.pending?.steps ?? []).map((step) =>
      step.kind === "connect" ? { ...step, refusedAt: "<t>" } : step,
    );
    return { message, steps };
  };
}

test.each([
  "GMAIL_CREATE_FILTER",
  "GMAIL_UPDATE_VACATION_SETTINGS",
  "GMAIL_PATCH_SEND_AS",
])(
  "%s missing its settings permission gets manual steps, no reconnect",
  async (action) => {
    refuseWith(GOOGLE_SCOPE_403, action, "gmail");
    const { message, steps } = await conversation()(action);
    expect(message).toContain("can never include the permission");
    expect(message).toContain("do not ask the user to reconnect");
    expect(message).not.toContain("request_connection");
    expect(steps).toEqual([]);
  },
);

test.each([
  ["GMAIL_FETCH_EMAILS", "gmail"],
  // Settings reads and forwarding also accept the full-mail permission.
  ["GMAIL_LIST_FILTERS", "gmail"],
  ["GMAIL_FORWARD_MESSAGE", "gmail"],
  ["GOOGLEDRIVE_FIND_FILE", "googledrive"],
])(
  "%s missing a permission queues one reconnect, then falls back to manual steps",
  async (action, toolkit) => {
    refuseWith(GOOGLE_SCOPE_403, action, toolkit);
    const turn = conversation();
    const first = await turn(action);
    expect(first.message).toContain(
      `A reconnect step for ${toolkit} was added`,
    );
    expect(first.message).toContain("tick every permission box");
    expect(first.message).toContain(
      "Do not retry this action until they reconnect",
    );
    expect(first.steps).toEqual([
      { kind: "connect", id: "c1", toolkit, reconnect: true, refusedAt: "<t>" },
    ]);

    // Refused again in a later turn: the reconnect did not help.
    const again = await turn(action);
    expect(again.message).toContain("a reconnect was already offered");
    expect(again.message).toContain("do not ask for another reconnect");
    expect(again.steps).toEqual([]);
  },
);

test("the reconnect guard is per app", async () => {
  const turn = conversation();
  refuseWith(GOOGLE_SCOPE_403, "GMAIL_FETCH_EMAILS", "gmail");
  await turn("GMAIL_FETCH_EMAILS");
  refuseWith(GOOGLE_SCOPE_403, "GOOGLEDRIVE_FIND_FILE", "googledrive");
  const drive = await turn("GOOGLEDRIVE_FIND_FILE");
  expect(drive.steps).toEqual([
    {
      kind: "connect",
      id: "c1",
      toolkit: "googledrive",
      reconnect: true,
      refusedAt: "<t>",
    },
  ]);
});

test("a toolkit search never named gets the Integrations page, no card", async () => {
  refuseWith(GOOGLE_SCOPE_403);
  const { message, steps } = await conversation()("GMAIL_FETCH_EMAILS", false);
  expect(message).toContain("on Houston's Integrations page");
  expect(message).toContain("tick every permission box");
  expect(message).not.toContain("A reconnect step");
  expect(steps).toEqual([]);
});

test("Slack missing_scope is reconnected from Integrations, retried once", async () => {
  refuseWith(SLACK_MISSING_SCOPE, "SLACK_ADD_REACTION_TO_AN_ITEM", "slack");
  const { message, steps } = await conversation()(
    "SLACK_ADD_REACTION_TO_AN_ITEM",
  );
  expect(message).toContain("reconnect the app in Integrations");
  expect(message).toContain("retry this action once");
  expect(message).toContain("do not ask for another reconnect");
  expect(message).not.toContain("can never include");
  expect(steps).toEqual([]);
});

test("an unrelated refusal gets no permission guidance", async () => {
  refuseWith("quota exceeded", "GMAIL_FETCH_EMAILS", "gmail");
  const { message, steps } = await conversation()("GMAIL_FETCH_EMAILS");
  expect(message).toMatch(/did not succeed: quota exceeded$/);
  expect(steps).toEqual([]);
});
