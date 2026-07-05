import { describe, expect, it } from "vitest";
import type { FeedFrame } from "../turns/history";
import {
  buildHistorySearchText,
  extractSnippet,
  matchesPhrase,
  normalizeQuery,
} from "./search-text";

describe("normalizeQuery", () => {
  it("folds accents/case and collapses internal whitespace to a phrase", () => {
    expect(normalizeQuery("  Café   Crème ")).toBe("cafe creme");
  });
});

describe("matchesPhrase", () => {
  it("matches a folded phrase contiguously, whitespace flexible", () => {
    const q = normalizeQuery("this month");
    expect(matchesPhrase("plan for this\nmonth", q)).toBe(true);
    // Scattered words are NOT a phrase match.
    expect(matchesPhrase("this quarter, next month", q)).toBe(false);
  });

  it("is accent-insensitive both ways", () => {
    expect(matchesPhrase("Tökyö", normalizeQuery("tokyo"))).toBe(true);
  });

  it("does not match an empty query or empty text", () => {
    expect(matchesPhrase("anything", "")).toBe(false);
    expect(matchesPhrase(undefined, normalizeQuery("x"))).toBe(false);
  });
});

describe("extractSnippet", () => {
  it("centers a clipped fragment on the first match with ellipses", () => {
    const text = `${"a ".repeat(60)}the needle here ${"b ".repeat(60)}`;
    const snip = extractSnippet(text, normalizeQuery("needle"));
    expect(snip).not.toBeNull();
    expect(snip).toContain("needle");
    expect(snip?.startsWith("…")).toBe(true);
    expect(snip?.endsWith("…")).toBe(true);
  });

  it("returns null when the phrase is absent", () => {
    expect(extractSnippet("nothing here", normalizeQuery("absent"))).toBeNull();
  });
});

describe("buildHistorySearchText", () => {
  it("extracts per-frame searchable text mirroring the desktop", () => {
    const frames: FeedFrame[] = [
      { feed_type: "user_message", data: "deploy the api" },
      { feed_type: "tool_call", data: { name: "shell", input: { cmd: "ls" } } },
      { feed_type: "tool_result", data: { content: "ok", is_error: false } },
      { feed_type: "assistant_text", data: "done deploying" },
      {
        feed_type: "final_result",
        data: { result: "shipped", cost_usd: null, duration_ms: null },
      },
    ];
    const text = buildHistorySearchText(frames);
    expect(text).toContain("deploy the api");
    expect(text).toContain("shell");
    expect(text).toContain("ls");
    expect(text).toContain("ok");
    expect(text).toContain("done deploying");
    expect(text).toContain("shipped");
  });
});
