import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  buildProcessHeaderLabel,
  getActiveToolName,
} from "../src/chat-process-header.ts";
import type { ChatProcessSegment } from "../src/chat-process-groups.ts";

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
// surface only the ONE action in progress, fall back cleanly when nothing is in
// flight, and never leak a count.
describe("buildProcessHeaderLabel", () => {
  it("names the one tool in progress while active", () => {
    strictEqual(
      buildProcessHeaderLabel({ isActive: true, segments: [seg([{ name: "Read" }])] }),
      "Mission in progress: Reading file",
    );
  });

  it("falls back to the bare active label when the last tool has finished", () => {
    strictEqual(
      buildProcessHeaderLabel({
        isActive: true,
        segments: [seg([{ name: "Read", result: RESULT }])],
      }),
      "Mission in progress...",
    );
  });

  it("falls back to the bare active label for a reasoning-only segment", () => {
    strictEqual(
      buildProcessHeaderLabel({ isActive: true, segments: [seg([])] }),
      "Mission in progress...",
    );
  });

  it("reads the complete label once the mission settles", () => {
    strictEqual(
      buildProcessHeaderLabel({ isActive: false, segments: [seg([{ name: "Read" }])] }),
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

// The in-progress action must come from the live edge of the run, not an
// earlier step — otherwise the header would lie about what's happening now.
describe("getActiveToolName", () => {
  it("returns the last unresolved tool of the LAST segment only", () => {
    const segments = [
      seg([{ name: "Bash" }]), // earlier segment, ignored even though unresolved
      seg([{ name: "Read", result: RESULT }, { name: "Grep" }]),
    ];
    strictEqual(getActiveToolName(segments), "Grep");
  });

  it("returns undefined when the last segment's last tool already has a result", () => {
    const segments = [seg([{ name: "Read" }, { name: "Grep", result: RESULT }])];
    strictEqual(getActiveToolName(segments), undefined);
  });

  it("returns undefined for empty segments", () => {
    strictEqual(getActiveToolName([]), undefined);
  });
});
