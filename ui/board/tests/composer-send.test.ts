import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ComposerSendRoutes,
  routeComposerSend,
} from "../src/composer-send.ts";

const args = (activeSessionKey: string | null) => ({
  activeSessionKey,
  canCreate: true,
  hasMessages: activeSessionKey !== null,
  text: "typed",
  files: [],
  mentions: [],
});

function recorder(rewrite: { text: string } | boolean) {
  const sent: string[] = [];
  const unsent: string[] = [];
  const routes: ComposerSendRoutes = {
    onComposerSubmit: () =>
      typeof rewrite === "boolean"
        ? rewrite
        : { text: rewrite.text, onUnsent: () => unsent.push(rewrite.text) },
    onSendMessage: async (_key, text) => {
      sent.push(`send:${text}`);
    },
    onCreateConversation: async (text) => {
      sent.push(`create:${text}`);
      return "new-1";
    },
  };
  return { routes, sent, unsent };
}

test("a rewrite reaches a follow-up send and keeps its context out", async () => {
  const r = recorder({ text: "typed + comments" });
  const result = await routeComposerSend(r.routes, args("activity-1"));
  assert.deepEqual(result, { kind: "sent" });
  assert.deepEqual(r.sent, ["send:typed + comments"]);
  assert.deepEqual(r.unsent, []);
});

test("a rewrite reaches a new conversation too", async () => {
  const r = recorder({ text: "typed + comments" });
  const result = await routeComposerSend(r.routes, args(null));
  assert.deepEqual(result, { kind: "created", activityId: "new-1" });
  assert.deepEqual(r.sent, ["create:typed + comments"]);
  assert.deepEqual(r.unsent, []);
});

test("a failed send gives the rewrite's context back", async () => {
  const r = recorder({ text: "typed + comments" });
  r.routes.onSendMessage = async () => {
    throw new Error("offline");
  };
  await assert.rejects(routeComposerSend(r.routes, args("activity-1")));
  assert.deepEqual(r.unsent, ["typed + comments"]);
});

test("a rewrite with nowhere to go gives its context back", async () => {
  const r = recorder({ text: "typed + comments" });
  const result = await routeComposerSend(
    { onComposerSubmit: r.routes.onComposerSubmit },
    args(null),
  );
  assert.deepEqual(result, { kind: "dropped" });
  assert.deepEqual(r.unsent, ["typed + comments"]);
});

test("an interceptor that sends itself stops the routing", async () => {
  const r = recorder(true);
  assert.deepEqual(await routeComposerSend(r.routes, args("activity-1")), {
    kind: "handled",
  });
  assert.deepEqual(r.sent, []);
});

test("no interceptor answer sends the typed text", async () => {
  const r = recorder(false);
  await routeComposerSend(r.routes, args("activity-1"));
  assert.deepEqual(r.sent, ["send:typed"]);
});
