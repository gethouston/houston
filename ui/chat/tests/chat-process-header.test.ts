import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ChatProcessSegment } from "../src/chat-process-groups.ts";
import {
  buildProcessHeaderLabel,
  getCurrentActionToolName,
} from "../src/chat-process-header.ts";

type ToolStub = { name: string; result?: unknown };

const RESULT = { content: "ok", is_error: false };

function seg(tools: ToolStub[]): ChatProcessSegment {
  return {
    key: "k",
    sourceIndex: 0,
    message: {},
    tools,
  } as unknown as ChatProcessSegment;
}

// HOU-448: the header is the whole story while the log stays collapsed. It must
// surface the one current action, hold it across the reasoning gaps between
// tools (so it isn't a brief flash), fall back cleanly before the first tool,
// and never leak a count.
describe("buildProcessHeaderLabel", () => {
  it("names the tool currently running while active", () => {
    strictEqual(
      buildProcessHeaderLabel({
        isActive: true,
        segments: [seg([{ name: "Read" }])],
      }),
      "Mission in progress: Reading file",
    );
  });

  it("keeps naming the latest tool after it finishes (sticky, not just while running)", () => {
    strictEqual(
      buildProcessHeaderLabel({
        isActive: true,
        segments: [seg([{ name: "Read", result: RESULT }])],
      }),
      "Mission in progress: Reading file",
    );
  });

  it("holds the prior tool through a following reasoning-only segment", () => {
    strictEqual(
      buildProcessHeaderLabel({
        isActive: true,
        segments: [seg([{ name: "Edit", result: RESULT }]), seg([])],
      }),
      "Mission in progress: Editing file",
    );
  });

  it("falls back to the bare active label before any tool has run", () => {
    strictEqual(
      buildProcessHeaderLabel({ isActive: true, segments: [seg([])] }),
      "Mission in progress...",
    );
  });

  it("reads the complete label once the mission settles", () => {
    strictEqual(
      buildProcessHeaderLabel({
        isActive: false,
        segments: [seg([{ name: "Read" }])],
      }),
      "Mission log",
    );
  });

  it("honors a custom toolLabels override for the action verb", () => {
    strictEqual(
      buildProcessHeaderLabel({
        isActive: true,
        segments: [seg([{ name: "Read" }])],
        toolLabels: { Read: "Peeking" },
      }),
      "Mission in progress: Peeking",
    );
  });

  it("honors localized labels (active / complete / activeAction template)", () => {
    const labels = {
      active: "Misión en curso...",
      complete: "Registro de misión",
      activeAction: (action: string) => `Misión en curso: ${action}`,
    };
    strictEqual(
      buildProcessHeaderLabel({
        isActive: true,
        segments: [seg([{ name: "Bash" }])],
        labels,
      }),
      "Misión en curso: Running command",
    );
    strictEqual(
      buildProcessHeaderLabel({ isActive: true, segments: [seg([])], labels }),
      "Misión en curso...",
    );
    strictEqual(
      buildProcessHeaderLabel({ isActive: false, segments: [seg([])], labels }),
      "Registro de misión",
    );
  });
});

// The current action tracks the most recent tool of the active turn — across
// segment boundaries — so the header narrates each step the agent takes.
describe("getCurrentActionToolName", () => {
  it("returns the last tool of the LAST segment that has tools", () => {
    const segments = [
      seg([{ name: "Bash" }]),
      seg([{ name: "Read", result: RESULT }, { name: "Grep" }]),
    ];
    strictEqual(getCurrentActionToolName(segments), "Grep");
  });

  it("returns a tool even when it already has a result", () => {
    const segments = [
      seg([{ name: "Read" }, { name: "Grep", result: RESULT }]),
    ];
    strictEqual(getCurrentActionToolName(segments), "Grep");
  });

  it("skips a trailing reasoning-only segment to find the prior tool", () => {
    const segments = [seg([{ name: "Write" }]), seg([])];
    strictEqual(getCurrentActionToolName(segments), "Write");
  });

  it("returns undefined when no segment has any tool", () => {
    strictEqual(getCurrentActionToolName([seg([]), seg([])]), undefined);
  });

  it("returns undefined for empty segments", () => {
    strictEqual(getCurrentActionToolName([]), undefined);
  });
});
