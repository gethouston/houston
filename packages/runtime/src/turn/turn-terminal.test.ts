import { describe, expect, it } from "vitest";
import { turnTerminalFrame } from "./turn-terminal";

describe("turnTerminalFrame", () => {
  it("keeps the public done frame (null data) when nothing changed", () => {
    expect(turnTerminalFrame({}, "t1", 0)).toEqual({
      type: "done",
      data: null,
      turnId: "t1",
    });
  });

  it("carries changed on the done frame", () => {
    expect(
      turnTerminalFrame({}, "t1", 0, undefined, undefined, [
        "ActivityChanged",
        "ConversationsChanged",
      ]),
    ).toEqual({
      type: "done",
      data: { changed: ["ActivityChanged", "ConversationsChanged"] },
      turnId: "t1",
    });
  });

  it("carries changed on the error frame beside the message", () => {
    // A provider failure after a durable tool write still changed what other
    // tabs show; the message the SDK reads is untouched.
    expect(
      turnTerminalFrame({ error: "boom" }, "t1", 2, undefined, undefined, [
        "ConversationsChanged",
      ]),
    ).toEqual({
      type: "error",
      data: {
        message: "boom",
        changed: ["ConversationsChanged"],
        poolWritesOutOfScope: 2,
      },
      turnId: "t1",
    });
  });
});
