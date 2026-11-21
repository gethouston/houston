import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  DEFAULT_TURN_MODE,
  normalizeTurnMode,
  resolveConversationTurnMode,
} from "../src/lib/turn-mode.ts";

// `normalizeTurnMode` remains the read-side guard for legacy/live pins: only
// the three known mode values may cross the UI boundary.
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
    strictEqual(normalizeTurnMode("Plan"), DEFAULT_TURN_MODE); // case-sensitive
    strictEqual(normalizeTurnMode("Auto"), DEFAULT_TURN_MODE); // case-sensitive
    strictEqual(normalizeTurnMode("autopilot"), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode("readonly"), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode(42), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode({ mode: "plan" }), DEFAULT_TURN_MODE);
  });

  it("falls back to Ask First as the product default", () => {
    strictEqual(DEFAULT_TURN_MODE, "execute");
  });
});

// HOU-205: a conversation keeps its mode on its card, so reopening the chat
// shows the mode the person picked instead of Ask first.
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
        picked: { cardId: "m1", mode: "auto" },
      }),
      "auto",
    );
  });

  it("never carries a pick on one card into another", () => {
    strictEqual(
      resolveConversationTurnMode({
        ...base,
        card: { id: "m2" },
        picked: { cardId: "m1", mode: "auto" },
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
