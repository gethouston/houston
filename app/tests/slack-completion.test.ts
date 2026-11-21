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
    strictEqual(
      slackCompletionResult({ kind: "invalid" }, "already"),
      "unredeemable",
    );
  });
});

describe("taking the queued completion", () => {
  const take = (queue: { value: SlackCompletion | null }) =>
    takeSlackCompletion(
      () => queue.value,
      () => {
        queue.value = null;
      },
    );

  it("takes nothing from an empty queue and leaves the next take free", () => {
    const queue: { value: SlackCompletion | null } = { value: null };
    strictEqual(take(queue), null);
    queue.value = { kind: "ticket", ticket };
    deepStrictEqual(take(queue), { kind: "ticket", ticket });
  });

  it("hands one queued ticket over once and clears it", () => {
    const queue: { value: SlackCompletion | null } = {
      value: { kind: "ticket", ticket },
    };
    deepStrictEqual(take(queue), { kind: "ticket", ticket });
    strictEqual(queue.value, null);
    strictEqual(take(queue), null);
  });

  it("takes a new ticket from a later connect while the section stays mounted", () => {
    const queue: { value: SlackCompletion | null } = {
      value: { kind: "ticket", ticket },
    };
    deepStrictEqual(take(queue), { kind: "ticket", ticket });
    queue.value = { kind: "ticket", ticket: "Second-ticket_42" };
    deepStrictEqual(take(queue), {
      kind: "ticket",
      ticket: "Second-ticket_42",
    });
  });
});
