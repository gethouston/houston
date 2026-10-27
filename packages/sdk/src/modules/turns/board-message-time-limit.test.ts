import { applyActivityUpdate } from "@houston/domain";
import type { Activity } from "@houston/protocol";
import { expect, test } from "vitest";
import { adoptReply } from "./adopt-reply";
import { TurnBoardWrites } from "./board-writes";
import type { FeedOutput } from "./feed-output";
import { applyTurnFrame } from "./turn-frames";
import { newTurnState } from "./turn-state";

for (const code of ["turn_time_limit", "turn_time_limit_unsaved"] as const) {
  test.each([
    "live",
    "history",
  ])(`a ${code} %s settle keeps the last message time`, async (path) => {
    const earlier = "2026-10-26T10:00:00.000Z";
    let card: Activity = {
      id: "m1",
      title: "Draft",
      description: "",
      status: "running",
      last_message_at: earlier,
    };
    const notices: unknown[] = [];
    const statuses: unknown[] = [];
    const output: FeedOutput = {
      pushFeedItem(_agent, _session, item) {
        notices.push(item);
      },
      sessionStatus(_agent, _session, status) {
        statuses.push(status);
      },
      async persistBoardStatus(_agent, _session, status, _interaction, opts) {
        card = applyActivityUpdate(
          card,
          { status },
          "2026-10-27T17:00:00.000Z",
          undefined,
          opts?.stamp,
        );
      },
    };
    const board = new TurnBoardWrites(output, "a1", `${code}-${path}`);
    const state = newTurnState("a1", `${code}-${path}`, output, { board });
    state.text = "Partial work";
    state.delivered = true;
    if (path === "live")
      applyTurnFrame(
        state,
        {
          type: "error",
          data: { code, message: "Time limit" },
        },
        () => {},
      );
    else
      adoptReply(state, {
        role: "assistant",
        content: "Partial work",
        ts: 1,
        stopReason: code,
      });
    await board.settled;
    expect(card.status).toBe("needs_you");
    expect(card.last_message_at).toBe(earlier);
    expect(statuses).toEqual(["completed"]);
    expect(notices).toContainEqual(
      expect.objectContaining({ feed_type: "system_message", notice: code }),
    );
  });
}
