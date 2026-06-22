import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type EnvelopeLike,
  eventIdFromEnvelope,
  isAcceptedStatus,
  resolveCapturedEventId,
} from "../src/lib/sentry-transport.ts";

// These pure helpers back Houston's "report sent" guarantee: the green toast +
// event id appear ONLY when Sentry actually accepted the event over direct
// HTTP. Pin that logic down so a regression can't reintroduce the old
// dishonest toast (which fired on a queue-drain, not real delivery).

describe("isAcceptedStatus", () => {
  it("accepts 2xx", () => {
    assert.equal(isAcceptedStatus(200), true);
    assert.equal(isAcceptedStatus(202), true);
    assert.equal(isAcceptedStatus(299), true);
  });

  it("accepts an absent status (completed send, no explicit HTTP status)", () => {
    assert.equal(isAcceptedStatus(undefined), true);
  });

  it("rejects 4xx / 5xx (rate-limited, rejected, server error)", () => {
    assert.equal(isAcceptedStatus(400), false);
    assert.equal(isAcceptedStatus(429), false);
    assert.equal(isAcceptedStatus(500), false);
    assert.equal(isAcceptedStatus(300), false);
    assert.equal(isAcceptedStatus(199), false);
  });
});

describe("eventIdFromEnvelope", () => {
  it("reads the event id from the envelope header", () => {
    const envelope: EnvelopeLike = [
      { event_id: "9c2a1f0011223344" },
      [{ type: "event" }, {}],
    ];
    assert.equal(eventIdFromEnvelope(envelope), "9c2a1f0011223344");
  });

  it("returns undefined when the header has no event id (e.g. a replay envelope)", () => {
    const envelope: EnvelopeLike = [{}, [{ type: "replay_recording" }, {}]];
    assert.equal(eventIdFromEnvelope(envelope), undefined);
  });
});

describe("resolveCapturedEventId", () => {
  it("returns the id only when flushed AND accepted", () => {
    assert.equal(resolveCapturedEventId("abc123", true, true), "abc123");
  });

  it("returns '' when not flushed (offline / timeout)", () => {
    assert.equal(resolveCapturedEventId("abc123", false, true), "");
  });

  it("returns '' when flushed but Sentry did not accept (4xx / 429 / dropped)", () => {
    assert.equal(resolveCapturedEventId("abc123", true, false), "");
  });

  it("returns '' when neither", () => {
    assert.equal(resolveCapturedEventId("abc123", false, false), "");
  });
});
