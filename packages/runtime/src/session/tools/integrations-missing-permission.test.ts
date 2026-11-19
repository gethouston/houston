import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import { makeIntegrationTools } from "./integrations";
import { httpSandboxFetch } from "./sandbox-fetch";

/**
 * integration_execute on a refusal for a permission the connection lacks: a
 * never-grantable Gmail settings write gets manual steps, any other Google
 * refusal queues ONE reconnect per app per session, Slack is reconnected from
 * Integrations.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// The prod shape: Composio relays Google's 403 body verbatim.
const GOOGLE_SCOPE_403 = `{"error":{"code":403,"message":"Request had insufficient authentication scopes.","status":"PERMISSION_DENIED","details":[{"reason":"ACCESS_TOKEN_SCOPE_INSUFFICIENT"}]}}`;
const SLACK_MISSING_SCOPE = `{"ok":false,"error":"missing_scope","needed":"reactions:write"}`;

function refuseWith(error: string) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ successful: false, error }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

/** A fresh session: the once-per-app reconnect guard starts empty. */
function session() {
  const [, execute] = makeIntegrationTools({
    call: httpSandboxFetch("https://host.test/", "sb-tok"),
  });
  if (!execute) throw new Error("expected integration_execute");
  const ctx = {} as unknown as ExtensionToolContext;
  /** One turn: runs the action, returns the failure text and queued steps. */
  return async (action: string) => {
    const holder = newInteractionHolder();
    let message = "";
    await runWithInteractionCapture(holder, () =>
      execute.execute("id", { action, params: {} }, undefined, undefined, ctx),
    ).catch((err: Error) => {
      message = err.message;
    });
    return { message, steps: holder.pending?.steps ?? [] };
  };
}

test.each([
  "GMAIL_CREATE_FILTER",
  "GMAIL_UPDATE_VACATION_SETTINGS",
  "GMAIL_PATCH_SEND_AS",
])("%s missing its settings permission gets manual steps, no reconnect", async (action) => {
  refuseWith(GOOGLE_SCOPE_403);
  const { message, steps } = await session()(action);
  expect(message).toContain("can never include the permission");
  expect(message).toContain("do not ask the user to reconnect");
  expect(message).not.toContain("request_connection");
  expect(steps).toEqual([]);
});

test.each([
  ["GMAIL_FETCH_EMAILS", "gmail"],
  // Settings reads and forwarding also accept the full-mail permission.
  ["GMAIL_LIST_FILTERS", "gmail"],
  ["GMAIL_FORWARD_MESSAGE", "gmail"],
  ["GOOGLEDRIVE_FIND_FILE", "googledrive"],
])("%s missing a permission queues one reconnect, then falls back to manual steps", async (action, toolkit) => {
  refuseWith(GOOGLE_SCOPE_403);
  const run = session();
  const first = await run(action);
  expect(first.message).toContain("A reconnect step for this app was added");
  expect(first.message).toContain("tick every permission box");
  expect(first.message).toContain(
    "Do not retry this action until they reconnect",
  );
  expect(first.steps).toEqual([
    { kind: "connect", id: "c1", toolkit, reconnect: true },
  ]);

  // Refused again in a later turn: the reconnect did not help.
  const again = await run(action);
  expect(again.message).toContain("a reconnect was already offered");
  expect(again.message).toContain("do not ask for another reconnect");
  expect(again.steps).toEqual([]);
});

test("the reconnect guard is per app", async () => {
  refuseWith(GOOGLE_SCOPE_403);
  const run = session();
  await run("GMAIL_FETCH_EMAILS");
  const drive = await run("GOOGLEDRIVE_FIND_FILE");
  expect(drive.steps).toEqual([
    { kind: "connect", id: "c1", toolkit: "googledrive", reconnect: true },
  ]);
});

test("Slack missing_scope is reconnected from Integrations, retried once", async () => {
  refuseWith(SLACK_MISSING_SCOPE);
  const { message, steps } = await session()("SLACK_ADD_REACTION_TO_AN_ITEM");
  expect(message).toContain("reconnect the app in Integrations");
  expect(message).toContain("retry this action once");
  expect(message).toContain("do not ask for another reconnect");
  expect(message).not.toContain("can never include");
  expect(steps).toEqual([]);
});

test("an unrelated refusal gets no permission guidance", async () => {
  refuseWith("quota exceeded");
  const { message, steps } = await session()("GMAIL_FETCH_EMAILS");
  expect(message).toMatch(/did not succeed: quota exceeded$/);
  expect(steps).toEqual([]);
});
