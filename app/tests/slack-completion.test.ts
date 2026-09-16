import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { SlackCompletion } from "../src/lib/settings-landing.ts";
import {
  slackCompletionResult,
  takeSlackCompletion,
} from "../src/lib/slack-completion.ts";

const ticket = "Tk7-ticket.value_~9";

describe("why a Slack connection did not happen", () => {
  it("is nothing at all while nothing has been refused", () => {
    strictEqual(slackCompletionResult(null, null), null);
    strictEqual(slackCompletionResult({ kind: "ticket", ticket }, null), null);
  });
  it("reads a mangled link and a refused ticket as the same dead end", () => {
    strictEqual(
      slackCompletionResult({ kind: "invalid" }, null),
      "unredeemable",
    );
    strictEqual(slackCompletionResult(null, "invalid"), "unredeemable");
  });
  it("tells an account connected elsewhere apart from a dead link", () => {
    strictEqual(slackCompletionResult(null, "already"), "taken");
    // The link that landed is spent either way: what the gateway said wins.
    strictEqual(
      slackCompletionResult({ kind: "invalid" }, "already"),
      "unredeemable",
    );
  });
});

describe("taking the queued completion", () => {
  const take = (
    latch: { current: boolean },
    queue: { value: SlackCompletion | null },
  ) =>
    takeSlackCompletion(
      latch,
      () => queue.value,
      () => {
        queue.value = null;
      },
    );

  it("waits for the landing instead of closing over an empty queue", () => {
    const latch = { current: false };
    const queue: { value: SlackCompletion | null } = { value: null };
    // The section mounted before the landing queued anything: taking nothing
    // must not spend the one take there is.
    strictEqual(take(latch, queue), null);
    queue.value = { kind: "ticket", ticket };
    deepStrictEqual(take(latch, queue), { kind: "ticket", ticket });
  });

  it("hands the ticket over exactly once and clears it", () => {
    const latch = { current: false };
    const queue: { value: SlackCompletion | null } = {
      value: { kind: "ticket", ticket },
    };
    deepStrictEqual(take(latch, queue), { kind: "ticket", ticket });
    strictEqual(queue.value, null);
    queue.value = { kind: "ticket", ticket };
    strictEqual(take(latch, queue), null);
  });
});
