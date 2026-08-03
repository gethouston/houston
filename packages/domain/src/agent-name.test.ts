import { describe, expect, it } from "vitest";
import {
  AGENT_NAME_MAX_LENGTH,
  invalidAgentNameMessage,
  validateAgentName,
} from "./agent-name";

describe("validateAgentName", () => {
  it("accepts ordinary names and returns them trimmed", () => {
    expect(validateAgentName("Personal assistant")).toEqual({
      ok: true,
      name: "Personal assistant",
    });
    expect(validateAgentName("  Bookkeeper  ")).toEqual({
      ok: true,
      name: "Bookkeeper",
    });
    expect(validateAgentName("Ana's agent (v2)")).toEqual({
      ok: true,
      name: "Ana's agent (v2)",
    });
    // Interior dots are fine; only leading dots hide the folder.
    expect(validateAgentName("v2.0 helper").ok).toBe(true);
  });

  it("rejects empty and whitespace-only names", () => {
    expect(validateAgentName("")).toEqual({ ok: false, reason: "empty" });
    expect(validateAgentName("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects names over the length cap", () => {
    expect(validateAgentName("a".repeat(AGENT_NAME_MAX_LENGTH)).ok).toBe(true);
    expect(validateAgentName("a".repeat(AGENT_NAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("rejects path separators, '..', leading dots, and control characters", () => {
    for (const name of [
      "hello/",
      "a/b",
      "a\\b",
      "..",
      "a..b",
      ".hidden",
      "a\nb",
      "a\u0000b",
    ]) {
      expect(validateAgentName(name)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("has a message for every reason", () => {
    expect(invalidAgentNameMessage("empty")).toMatch(/empty/);
    expect(invalidAgentNameMessage("too_long")).toContain(
      String(AGENT_NAME_MAX_LENGTH),
    );
    expect(invalidAgentNameMessage("invalid")).toMatch(/slashes/);
  });
});
