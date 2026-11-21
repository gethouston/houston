import type { Activity } from "@houston/protocol";
import { describe, expect, test } from "vitest";
import { applyActivityUpdate, createActivity } from "./activities";
import { conversationTurnMode } from "./conversation-mode";

const NOW = "2026-11-20T00:00:00.000Z";
const card = (patch: Partial<Activity>): Activity => ({
  id: "m1",
  title: "Deck",
  description: "",
  status: "done",
  ...patch,
});

describe("conversationTurnMode (HOU-205)", () => {
  test("reads the mode the conversation's card keeps", () => {
    expect(conversationTurnMode([card({ mode: "auto" })], "activity-m1")).toBe(
      "auto",
    );
    expect(
      conversationTurnMode(
        [card({ mode: "plan", session_key: "welcome-1" })],
        "welcome-1",
      ),
    ).toBe("plan");
  });

  test("no card, a card with no mode, or an unknown one names no mode", () => {
    expect(conversationTurnMode([], "activity-m1")).toBeUndefined();
    expect(conversationTurnMode([card({})], "activity-m1")).toBeUndefined();
    expect(
      conversationTurnMode([card({ mode: "auto" })], "activity-other"),
    ).toBeUndefined();
    const junk = { ...card({}), mode: "turbo" } as unknown as Activity;
    expect(conversationTurnMode([junk], "activity-m1")).toBeUndefined();
  });

  test("an API card older than the field keeps the Autopilot it always ran", () => {
    expect(
      conversationTurnMode([card({ started_by: "api" })], "activity-m1"),
    ).toBe("auto");
    expect(
      conversationTurnMode(
        [card({ started_by: "api", mode: "execute" })],
        "activity-m1",
      ),
    ).toBe("execute");
    expect(
      conversationTurnMode([card({ started_by: "houston" })], "activity-m1"),
    ).toBeUndefined();
  });

  test("a create keeps the composer's mode, normalizing an unknown one", () => {
    expect(createActivity({ title: "T", mode: "auto" }, "m1", NOW).mode).toBe(
      "auto",
    );
    expect("mode" in createActivity({ title: "T" }, "m1", NOW)).toBe(false);
    const forged = { title: "T", mode: "root" } as unknown as Parameters<
      typeof createActivity
    >[0];
    expect(createActivity(forged, "m1", NOW).mode).toBe("execute");
  });

  test("an update moves the kept mode and leaves it alone when absent", () => {
    const kept = applyActivityUpdate(card({}), { mode: "auto" }, NOW);
    expect(kept.mode).toBe("auto");
    expect(applyActivityUpdate(kept, { status: "running" }, NOW).mode).toBe(
      "auto",
    );
  });
});
