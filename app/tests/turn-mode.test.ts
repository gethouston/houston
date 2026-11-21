import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  DEFAULT_TURN_MODE,
  normalizeTurnMode,
  pickSettled,
  resolveConversationTurnMode,
} from "../src/lib/turn-mode.ts";

describe("normalizeTurnMode", () => {
  it("keeps the three known modes", () => {
    strictEqual(normalizeTurnMode("plan"), "plan");
    strictEqual(normalizeTurnMode("auto"), "auto");
    strictEqual(normalizeTurnMode("execute"), "execute");
  });

  it("normalizes absent / unset values to the default mode", () => {
    strictEqual(normalizeTurnMode(undefined), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode(null), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode(""), DEFAULT_TURN_MODE);
  });

  it("normalizes unknown / legacy / wrong-typed values to the default mode", () => {
    strictEqual(normalizeTurnMode("planning"), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode("Plan"), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode("Auto"), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode("autopilot"), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode("readonly"), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode(42), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode({ mode: "plan" }), DEFAULT_TURN_MODE);
  });

  it("falls back to Ask First as the product default", () => {
    strictEqual(DEFAULT_TURN_MODE, "execute");
  });
});

describe("resolveConversationTurnMode", () => {
  const base = {
    picked: null,
    localMode: "plan" as const,
    fallback: "execute" as const,
  };

  it("shows the mode the card keeps", () => {
    strictEqual(
      resolveConversationTurnMode({
        ...base,
        card: { id: "m1", mode: "auto" },
      }),
      "auto",
    );
  });

  it("shows this session's pick on that card while the write lands", () => {
    strictEqual(
      resolveConversationTurnMode({
        ...base,
        card: { id: "m1", mode: "execute" },
        picked: { cardId: "m1", mode: "auto", from: "execute" },
      }),
      "auto",
    );
  });

  it("never carries a pick on one card into another", () => {
    strictEqual(
      resolveConversationTurnMode({
        ...base,
        card: { id: "m2" },
        picked: { cardId: "m1", mode: "auto", from: undefined },
      }),
      "execute",
    );
  });

  it("opens a card with no mode, or a junk one, on the fallback", () => {
    strictEqual(
      resolveConversationTurnMode({ ...base, card: { id: "m1" } }),
      "execute",
    );
    strictEqual(
      resolveConversationTurnMode({
        ...base,
        card: { id: "m1", mode: "turbo" },
      }),
      DEFAULT_TURN_MODE,
    );
  });

  it("holds the in-session pick when no card backs the chat", () => {
    strictEqual(resolveConversationTurnMode({ ...base, card: null }), "plan");
  });
});

describe("pickSettled", () => {
  const picked = { cardId: "m1", mode: "auto", from: "execute" } as const;

  it("keeps echoing the pick while the card still holds the old mode", () => {
    strictEqual(pickSettled(picked, { id: "m1", mode: "execute" }), false);
  });

  it("settles when the card reads the pick back", () => {
    strictEqual(pickSettled(picked, { id: "m1", mode: "auto" }), true);
  });

  it("settles on a later write from another surface, which wins", () => {
    strictEqual(pickSettled(picked, { id: "m1", mode: "plan" }), true);
  });

  it("never settles against another card", () => {
    strictEqual(pickSettled(picked, { id: "m2", mode: "auto" }), false);
    strictEqual(pickSettled(picked, null), false);
  });
});
