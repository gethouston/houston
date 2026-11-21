import type { ChatMessage } from "@houston/runtime-client";
import { describe, expect, test } from "vitest";
import {
  interactionOwner,
  refusesInteractionAnswer,
} from "./interaction-owner";

const question = {
  steps: [{ kind: "question" as const, id: "q1", question: "Send it?" }],
};
const offersOnly = {
  steps: [
    {
      kind: "suggest_actions" as const,
      id: "a1",
      actions: [{ id: "x", label: "Again", message: "again" }],
    },
  ],
};

const user = (userId: string | undefined, turnId?: string): ChatMessage => ({
  role: "user",
  content: "hi",
  ts: 1,
  ...(turnId ? { turnId } : {}),
  ...(userId ? { author: { userId } } : {}),
});
const reply = (
  extra: Partial<ChatMessage> = {},
  turnId?: string,
): ChatMessage => ({
  role: "assistant",
  content: "ok",
  ts: 2,
  ...(turnId ? { turnId } : {}),
  ...extra,
});

describe("interactionOwner", () => {
  test("no card: nobody owns the conversation's next message", () => {
    expect(interactionOwner([user("a", "t1"), reply({}, "t1")])).toBe(
      undefined,
    );
    expect(interactionOwner([])).toBe(undefined);
  });

  test("a suggestion-only card blocks nobody", () => {
    expect(
      interactionOwner([
        user("a", "t1"),
        reply({ pendingInteraction: offersOnly }, "t1"),
      ]),
    ).toBe(undefined);
  });

  test("a stopped card is no longer live", () => {
    expect(
      interactionOwner([
        user("a", "t1"),
        reply({ pendingInteraction: question }, "t1"),
        reply({ content: "", stopped: true }),
      ]),
    ).toBe(undefined);
    expect(
      interactionOwner([
        user("a", "t1"),
        reply({ pendingInteraction: question, stopped: true }, "t1"),
      ]),
    ).toBe(undefined);
  });

  test("the card belongs to the sender of the turn that raised it", () => {
    expect(
      interactionOwner([
        user("a", "t1"),
        reply({}, "t1"),
        user("b", "t2"),
        reply({ pendingInteraction: question }, "t2"),
      ]),
    ).toBe("b");
  });

  test("turnId picks the turn's own message, not the nearest one", () => {
    expect(
      interactionOwner([
        user("b", "t2"),
        user("a", "t3"),
        reply({ pendingInteraction: question }, "t2"),
      ]),
    ).toBe("b");
  });

  test("a card with no turnId falls back to the nearest preceding message", () => {
    expect(
      interactionOwner([
        user("a"),
        reply(),
        user("b"),
        reply({ pendingInteraction: question }),
      ]),
    ).toBe("b");
  });

  test("unknown person: no author on the turn's message", () => {
    expect(
      interactionOwner([
        user(undefined, "t1"),
        reply({ pendingInteraction: question }, "t1"),
      ]),
    ).toBe(undefined);
    expect(
      interactionOwner([
        user("a", "t0"),
        reply({ pendingInteraction: question }, "t1"),
      ]),
    ).toBe(undefined);
  });
});

describe("refusesInteractionAnswer", () => {
  const conversation = [
    user("a", "t1"),
    reply({}, "t1"),
    user("b", "t2"),
    reply({ pendingInteraction: question }, "t2"),
  ];

  test("the person the card is for may answer it", () => {
    expect(refusesInteractionAnswer(conversation, "b")).toBe(false);
  });

  test("another member may not", () => {
    expect(refusesInteractionAnswer(conversation, "a")).toBe(true);
  });

  test("no acting identity (single-player) is never refused", () => {
    expect(refusesInteractionAnswer(conversation, undefined)).toBe(false);
  });

  test("an unknown card person is never refused", () => {
    expect(
      refusesInteractionAnswer(
        [user(undefined, "t1"), reply({ pendingInteraction: question }, "t1")],
        "a",
      ),
    ).toBe(false);
  });

  test("no live card is never refused", () => {
    expect(
      refusesInteractionAnswer(
        [user("b", "t1"), reply({ pendingInteraction: offersOnly }, "t1")],
        "a",
      ),
    ).toBe(false);
  });
});
