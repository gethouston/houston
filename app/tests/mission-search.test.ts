import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  buildMissionHistorySearchText,
  normalizeMissionSearchQuery,
  searchMissions,
} from "../src/components/mission-search.ts";

const missions = [
  {
    id: "one",
    title: "Budget review",
    description: "Discuss launch plan",
    status: "done",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "two",
    title: "Weekly report",
    description: "Find budget notes in transcript",
    status: "done",
    updatedAt: "2026-01-02T00:00:00Z",
  },
  {
    id: "three",
    title: "Customer follow-up",
    description: "Send agenda",
    status: "running",
    updatedAt: "2026-01-03T00:00:00Z",
  },
];

describe("mission search", () => {
  it("normalizes whitespace, case, and accents", () => {
    strictEqual(normalizeMissionSearchQuery("  São PAULO  "), "sao paulo");
  });

  it("returns title matches before body matches", () => {
    const result = searchMissions(missions, "budget");

    strictEqual(result.mode, "title");
    deepStrictEqual(
      result.items.map((item) => item.id),
      ["one"],
    );
  });

  it("falls back to mission descriptions when no title matches", () => {
    const result = searchMissions(missions, "transcript budget");

    strictEqual(result.mode, "text");
    deepStrictEqual(
      result.items.map((item) => item.id),
      ["two"],
    );
  });

  it("falls back to loaded chat history text", () => {
    const result = searchMissions(missions, "vendor contract", {
      three: "Assistant found the vendor contract in old messages.",
    });

    strictEqual(result.mode, "text");
    deepStrictEqual(
      result.items.map((item) => item.id),
      ["three"],
    );
  });

  it("builds searchable text from feed items", () => {
    const text = buildMissionHistorySearchText([
      { feed_type: "user_message", data: "Send invoice" },
      {
        feed_type: "tool_call",
        data: { name: "Grep", input: { pattern: "invoice" } },
      },
      {
        feed_type: "tool_result",
        data: { content: "Found billing.csv", is_error: false },
      },
      {
        feed_type: "file_changes",
        data: { created: ["out.md"], modified: ["billing.csv"] },
      },
      {
        feed_type: "final_result",
        data: { result: "Invoice sent", cost_usd: null, duration_ms: null },
      },
    ]);

    strictEqual(text.includes("Send invoice"), true);
    strictEqual(text.includes("Grep"), true);
    strictEqual(text.includes("billing.csv"), true);
    strictEqual(text.includes("Invoice sent"), true);
  });
});
