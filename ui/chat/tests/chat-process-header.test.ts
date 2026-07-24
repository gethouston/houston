import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ChatProcessSegment } from "../src/chat-process-groups.ts";
import type { ChatActionBrand } from "../src/chat-process-header.ts";
import {
  buildProcessHeader,
  buildProcessHeaderLabel,
  getCurrentActionTool,
  getCurrentActionToolName,
  integrationActionOf,
} from "../src/chat-process-header.ts";
import type { ToolEntry } from "../src/feed-to-messages.ts";

type ToolStub = { name: string; input?: unknown; result?: unknown };

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
  it("names the tool currently running while active (the bare verb)", () => {
    strictEqual(
      buildProcessHeaderLabel({
        isActive: true,
        segments: [seg([{ name: "Read" }])],
      }),
      "Reading file",
    );
  });

  it("keeps naming the latest tool after it finishes (sticky, not just while running)", () => {
    strictEqual(
      buildProcessHeaderLabel({
        isActive: true,
        segments: [seg([{ name: "Read", result: RESULT }])],
      }),
      "Reading file",
    );
  });

  it("holds the prior tool through a following reasoning-only segment", () => {
    strictEqual(
      buildProcessHeaderLabel({
        isActive: true,
        segments: [seg([{ name: "Edit", result: RESULT }]), seg([])],
      }),
      "Editing file",
    );
  });

  it("falls back to the active thinking label before any tool has run", () => {
    strictEqual(
      buildProcessHeaderLabel({ isActive: true, segments: [seg([])] }),
      "Thinking...",
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
      "Peeking",
    );
  });

  it("honors localized labels (active / complete); the verb stays English", () => {
    const labels = {
      active: "Pensando...",
      complete: "Registro de misión",
    };
    strictEqual(
      buildProcessHeaderLabel({
        isActive: true,
        segments: [seg([{ name: "Bash" }])],
        labels,
      }),
      "Running command",
    );
    strictEqual(
      buildProcessHeaderLabel({ isActive: true, segments: [seg([])], labels }),
      "Pensando...",
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

// HOU-717: the pi engine's tools are lowercase (bash/read/grep/find/ls) —
// they must resolve to the same human verbs the Claude names do, or the
// header reads "bash".
describe("pi tool-name labels", () => {
  it("maps pi's lowercase tool names to verbs", () => {
    const segments = [seg([{ name: "bash" }])];
    strictEqual(
      buildProcessHeaderLabel({ isActive: true, segments }),
      "Running command",
    );
  });

  it("keeps the Claude names working unchanged", () => {
    const segments = [seg([{ name: "Bash" }])];
    strictEqual(
      buildProcessHeaderLabel({ isActive: true, segments }),
      "Running command",
    );
  });
});

// getCurrentActionTool returns the whole ToolEntry (not just its name) so the
// branded path can read `input.action` off the current call.
describe("getCurrentActionTool", () => {
  it("returns the last tool ENTRY of the last segment with tools", () => {
    const segments = [
      seg([{ name: "Bash" }]),
      seg([
        { name: "Read", result: RESULT },
        { name: "Grep", input: { q: 1 } },
      ]),
    ];
    deepStrictEqual(getCurrentActionTool(segments), {
      name: "Grep",
      input: { q: 1 },
    });
  });

  it("returns undefined when no segment has tools", () => {
    strictEqual(getCurrentActionTool([seg([]), seg([])]), undefined);
  });
});

// integrationActionOf reads the Composio action off an integration_execute call,
// tolerating MCP prefixes and any malformed/half-streamed input.
describe("integrationActionOf", () => {
  const tool = (name: string, input?: unknown): ToolEntry =>
    ({ name, input }) as ToolEntry;

  it("returns the action for a bare integration_execute", () => {
    strictEqual(
      integrationActionOf(
        tool("integration_execute", { action: "GMAIL_SEND_EMAIL" }),
      ),
      "GMAIL_SEND_EMAIL",
    );
  });

  it("strips an MCP server prefix off the tool name", () => {
    strictEqual(
      integrationActionOf(
        tool("mcp__houston__integration_execute", {
          action: "SLACK_POST_MESSAGE",
        }),
      ),
      "SLACK_POST_MESSAGE",
    );
  });

  it("returns undefined for a non-integration tool", () => {
    strictEqual(integrationActionOf(tool("Read", { action: "X" })), undefined);
    strictEqual(
      integrationActionOf(tool("integration_search", { query: "x" })),
      undefined,
    );
  });

  it("tolerates malformed input (null, non-object, missing/empty/non-string action)", () => {
    strictEqual(integrationActionOf(tool("integration_execute")), undefined);
    strictEqual(
      integrationActionOf(tool("integration_execute", null)),
      undefined,
    );
    strictEqual(
      integrationActionOf(tool("integration_execute", "GMAIL")),
      undefined,
    );
    strictEqual(
      integrationActionOf(tool("integration_execute", {})),
      undefined,
    );
    strictEqual(
      integrationActionOf(tool("integration_execute", { action: "" })),
      undefined,
    );
    strictEqual(
      integrationActionOf(tool("integration_execute", { action: 7 })),
      undefined,
    );
  });
});

// buildProcessHeader chooses the branded row only when the current tool is a
// resolvable integration_execute; everything else stays the plain text label.
describe("buildProcessHeader", () => {
  const brand: ChatActionBrand = {
    name: "Gmail",
    logoUrl: "https://logo",
    actionLabel: "Sending email",
  };
  const resolveActionBrand = (action: string) =>
    action === "GMAIL_SEND_EMAIL" ? brand : undefined;

  it("returns the brand when an integration_execute resolves", () => {
    const segments = [
      seg([
        { name: "integration_execute", input: { action: "GMAIL_SEND_EMAIL" } },
      ]),
    ];
    deepStrictEqual(
      buildProcessHeader({
        isActive: true,
        segments,
        labels: { resolveActionBrand },
      }),
      { kind: "brand", brand },
    );
  });

  it("falls back to the tool row when the resolver returns undefined", () => {
    const segments = [
      seg([{ name: "integration_execute", input: { action: "UNKNOWN_DO" } }]),
    ];
    deepStrictEqual(
      buildProcessHeader({
        isActive: true,
        segments,
        labels: { resolveActionBrand },
      }),
      { kind: "tool", label: "Using an app", toolName: "integration_execute" },
    );
  });

  it("is a tool row (icon + verb) for a non-integration tool even with a resolver", () => {
    deepStrictEqual(
      buildProcessHeader({
        isActive: true,
        segments: [seg([{ name: "Read" }])],
        labels: { resolveActionBrand },
      }),
      { kind: "tool", label: "Reading file", toolName: "Read" },
    );
  });

  it("is a plain text row (helmet + thinking) before any tool runs", () => {
    deepStrictEqual(
      buildProcessHeader({ isActive: true, segments: [seg([])] }),
      { kind: "text", label: "Thinking..." },
    );
  });

  it("stays plain text when settled (never branded), and a tool row with no resolver", () => {
    const segments = [
      seg([
        { name: "integration_execute", input: { action: "GMAIL_SEND_EMAIL" } },
      ]),
    ];
    deepStrictEqual(
      buildProcessHeader({
        isActive: false,
        segments,
        labels: { resolveActionBrand },
      }),
      { kind: "text", label: "Mission log" },
    );
    deepStrictEqual(buildProcessHeader({ isActive: true, segments }), {
      kind: "tool",
      label: "Using an app",
      toolName: "integration_execute",
    });
  });
});
