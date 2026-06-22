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
  it("normalizes whitespace, case, and accents into a single phrase", () => {
    strictEqual(normalizeMissionSearchQuery("  São   PAULO  "), "sao paulo");
  });

  it("matches a word in the title and shows no snippet for it", () => {
    const result = searchMissions(missions, "review");
    deepStrictEqual(
      result.items.map((m) => m.id),
      ["one"],
    );
    deepStrictEqual(result.snippets, {});
  });

  it("returns BOTH title and body matches (no title-first suppression)", () => {
    // "budget" is in one's title AND in two's description.
    const result = searchMissions(missions, "budget");
    deepStrictEqual(result.items.map((m) => m.id).sort(), ["one", "two"]);
    // one matched by title -> no snippet; two matched by body -> snippet.
    strictEqual(result.snippets["one"], undefined);
    strictEqual(result.snippets["two"] !== undefined, true);
    strictEqual(
      result.snippets["two"].text.toLowerCase().includes("budget"),
      true,
    );
  });

  it("treats a multi-word query as an exact phrase, not scattered words", () => {
    // "budget" and "transcript" both appear in two's description but not
    // contiguously, so the phrase must NOT match anything.
    deepStrictEqual(searchMissions(missions, "budget transcript").items, []);
    // The exact phrase that IS contiguous matches.
    deepStrictEqual(
      searchMissions(missions, "budget notes").items.map((m) => m.id),
      ["two"],
    );
  });

  it("searches loaded chat history, including the user's own messages", () => {
    const result = searchMissions(missions, "vendor contract", {
      three: "Assistant found the vendor contract in old messages.",
    });
    deepStrictEqual(
      result.items.map((m) => m.id),
      ["three"],
    );
    strictEqual(
      result.snippets["three"].text.toLowerCase().includes("vendor contract"),
      true,
    );
  });

  it("includes user messages, tools, files, and results in searchable text", () => {
    const text = buildMissionHistorySearchText([
      { feed_type: "user_message", data: "Send the invoice this month" },
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

    strictEqual(text.includes("Send the invoice this month"), true);
    strictEqual(text.includes("Grep"), true);
    strictEqual(text.includes("billing.csv"), true);
    strictEqual(text.includes("Invoice sent"), true);
  });

  it("returns the full list and no snippets when the query is empty", () => {
    const result = searchMissions(missions, "");
    strictEqual(result.hasQuery, false);
    deepStrictEqual(
      result.items.map((m) => m.id),
      ["one", "two", "three"],
    );
    deepStrictEqual(result.snippets, {});
  });
});
