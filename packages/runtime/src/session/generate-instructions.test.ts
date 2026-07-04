import { expect, test } from "vitest";
import { parseGenerateResult } from "./generate-instructions";

test("parses a valid JSON response", () => {
  const raw = `{"name": "Email Manager", "instructions": "You are a helpful agent.", "suggestedIntegrations": ["GMAIL", "SLACK"]}`;
  const result = parseGenerateResult(raw);
  expect(result.name).toBe("Email Manager");
  expect(result.instructions).toBe("You are a helpful agent.");
  expect(result.suggestedIntegrations).toEqual(["GMAIL", "SLACK"]);
  expect(result.suggestedRoutine).toBeNull();
});

test("strips markdown fences", () => {
  const raw =
    '```json\n{"name": "Test Bot", "instructions": "Test.", "suggestedIntegrations": []}\n```';
  const result = parseGenerateResult(raw);
  expect(result.name).toBe("Test Bot");
  expect(result.instructions).toBe("Test.");
  expect(result.suggestedIntegrations).toEqual([]);
});

test("missing name defaults to empty string", () => {
  const result = parseGenerateResult(`{"instructions": "Test."}`);
  expect(result.name).toBe("");
  expect(result.suggestedIntegrations).toEqual([]);
});

test("null suggestedIntegrations returns empty array", () => {
  // Models sometimes emit `null` instead of `[]`.
  const raw = `{"name": "Bot", "instructions": "Do things.", "suggestedIntegrations": null}`;
  expect(parseGenerateResult(raw).suggestedIntegrations).toEqual([]);
});

test("non-string entries in integrations are filtered", () => {
  const raw = `{"name": "Bot", "instructions": "Do things.", "suggestedIntegrations": ["GMAIL", 42, null, "SLACK"]}`;
  expect(parseGenerateResult(raw).suggestedIntegrations).toEqual([
    "GMAIL",
    "SLACK",
  ]);
});

test("missing instructions throws", () => {
  expect(() =>
    parseGenerateResult(`{"name": "Bot", "suggestedIntegrations": []}`),
  ).toThrow("missing 'instructions'");
});

test("invalid JSON throws", () => {
  expect(() => parseGenerateResult("not json at all")).toThrow(
    "JSON parse failed",
  );
});

// Routine PARSING edge cases live in suggested-routine.test.ts; here we only
// assert parseGenerateResult wires the value through correctly.
test("wires the routine through with an engine-built cron", () => {
  const raw = `{"name":"Bot","instructions":"Do.","suggestedRoutine":{"name":"Morning digest","prompt":"Summarize new emails.","scheduleType":"daily","timeOfDay":"08:00"}}`;
  const r = parseGenerateResult(raw).suggestedRoutine;
  expect(r?.name).toBe("Morning digest");
  expect(r?.schedule).toBe("0 8 * * *");

  const none = `{"name":"B","instructions":"D","suggestedRoutine":null}`;
  expect(parseGenerateResult(none).suggestedRoutine).toBeNull();
});
