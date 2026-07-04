import { expect, test } from "vitest";
import { buildRoutine, parseGenerateResult } from "./generate-agent-parse";

// Ported from the Rust engine's generate_instructions.rs + suggested_routine.rs
// unit tests, so the TS parser accepts exactly what the Rust one did.

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

test("null suggestedIntegrations becomes an empty array", () => {
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
  ).toThrow(/missing 'instructions'/);
});

test("invalid JSON throws", () => {
  expect(() => parseGenerateResult("not json at all")).toThrow(
    /JSON parse failed/,
  );
});

test("parse wires the routine through", () => {
  const raw = `{"name":"Bot","instructions":"Do.","suggestedRoutine":{"name":"Morning digest","prompt":"Summarize new emails.","scheduleType":"daily","timeOfDay":"08:00"}}`;
  const r = parseGenerateResult(raw).suggestedRoutine;
  expect(r?.name).toBe("Morning digest");
  expect(r?.schedule).toBe("0 8 * * *");

  const none = `{"name":"B","instructions":"D","suggestedRoutine":null}`;
  expect(parseGenerateResult(none).suggestedRoutine).toBeNull();
});

// --- buildRoutine: the cron is built here from a constrained set, never taken
// raw from the model, so a hallucinated expression can't run every minute. ---

test("daily builds a 5-field cron", () => {
  const r = buildRoutine({
    name: "Morning digest",
    prompt: "Summarize new emails.",
    scheduleType: "daily",
    timeOfDay: "08:00",
  });
  expect(r?.schedule).toBe("0 8 * * *");
});

test("weekdays builds a cron", () => {
  const r = buildRoutine({
    name: "Standup",
    prompt: "Post standup.",
    scheduleType: "weekdays",
    timeOfDay: "09:30",
  });
  expect(r?.schedule).toBe("30 9 * * 1-5");
});

test("weekly honors dayOfWeek and defaults to Monday", () => {
  expect(
    buildRoutine({
      name: "Report",
      prompt: "Send weekly report.",
      scheduleType: "weekly",
      timeOfDay: "17:00",
      dayOfWeek: 5,
    })?.schedule,
  ).toBe("0 17 * * 5");
  expect(
    buildRoutine({
      name: "R",
      prompt: "P.",
      scheduleType: "weekly",
      timeOfDay: "06:00",
    })?.schedule,
  ).toBe("0 6 * * 1");
});

test("null, missing, and malformed routines drop to null", () => {
  expect(buildRoutine(null)).toBeNull();
  expect(buildRoutine(undefined)).toBeNull();
  // Unknown scheduleType.
  expect(
    buildRoutine({
      name: "R",
      prompt: "P",
      scheduleType: "hourly",
      timeOfDay: "08:00",
    }),
  ).toBeNull();
  // Out-of-range time.
  expect(
    buildRoutine({
      name: "R",
      prompt: "P",
      scheduleType: "daily",
      timeOfDay: "25:00",
    }),
  ).toBeNull();
  // Empty name.
  expect(
    buildRoutine({
      name: "",
      prompt: "P",
      scheduleType: "daily",
      timeOfDay: "08:00",
    }),
  ).toBeNull();
  // Out-of-range dayOfWeek falls back to Monday rather than emitting bad cron.
  expect(
    buildRoutine({
      name: "R",
      prompt: "P",
      scheduleType: "weekly",
      timeOfDay: "06:00",
      dayOfWeek: 9,
    })?.schedule,
  ).toBe("0 6 * * 1");
});
