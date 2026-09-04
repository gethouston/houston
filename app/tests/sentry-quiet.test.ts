import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import * as Sentry from "@sentry/browser";
import { captureQuietEvent } from "../src/lib/sentry-quiet.ts";

/**
 * Whole-SDK check that a quiet-class capture leaves the client with its
 * FIXED fingerprint on the wire. Sentry groups by the event's `fingerprint`
 * unless a server-side fingerprinting rule matches first, so this pins the
 * client half of the contract: the outgoing envelope item carries the class
 * constant, the warning level, the class tag and the raw body as extra.
 */
type SentEvent = {
  fingerprint?: string[];
  level?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  exception?: { values?: { type?: string; value?: string }[] };
};

const sent: SentEvent[] = [];

before(() => {
  Sentry.init({
    dsn: "https://public@o0.ingest.sentry.io/0",
    defaultIntegrations: false,
    transport: () => ({
      send: async (envelope) => {
        for (const item of envelope[1] as unknown[]) {
          const [header, payload] = item as [{ type?: string }, SentEvent];
          if (header.type === "event") sent.push(payload);
        }
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
});

after(async () => {
  await Sentry.close(0);
});

describe("captureQuietEvent", () => {
  it("sends the class constant as the event fingerprint", async () => {
    const error = new Error("Load failed (gateway.gethouston.ai)");
    error.name = "load_chat_history";
    captureQuietEvent(error, {
      level: "warning",
      fingerprint: ["offline"],
      tags: { source: "load_chat_history", quiet_class: "offline" },
      extra: { command: "load_chat_history", body: "dial tcp: i/o timeout" },
    });
    assert.equal(await Sentry.flush(1000), true);

    assert.equal(sent.length, 1);
    const event = sent[0];
    assert.deepEqual(event.fingerprint, ["offline"]);
    assert.equal(event.level, "warning");
    assert.equal(event.tags?.quiet_class, "offline");
    assert.equal(event.tags?.source, "load_chat_history");
    assert.equal(event.extra?.body, "dial tcp: i/o timeout");
    assert.equal(event.exception?.values?.[0]?.type, "load_chat_history");
    assert.equal(
      event.exception?.values?.[0]?.value,
      "Load failed (gateway.gethouston.ai)",
    );
  });
});
