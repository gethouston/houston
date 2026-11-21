import { describe, expect, it } from "vitest";
import { type AnthropicUsageBody, anthropicWindows } from "./anthropic-windows";
import observed from "./fixtures/anthropic-oauth-usage.json";

const now = Date.parse("2026-11-21T18:40:00Z");
const sessionReset = "2026-11-21T21:00:00.000000+00:00";
const weekReset = "2026-11-27T02:00:00.074682+00:00";

function body(patch: Partial<AnthropicUsageBody>): AnthropicUsageBody {
  return { ...structuredClone(observed), ...patch };
}

describe("anthropicWindows", () => {
  it("reads the observed response shape", () => {
    expect(anthropicWindows(observed, now)).toEqual([
      {
        id: "week",
        usedPercent: 1,
        resetsAt: weekReset,
        windowMinutes: 10_080,
      },
    ]);
  });

  it("answers the numbers of the server's limit rows over the legacy blocks", () => {
    const windows = anthropicWindows(
      body({
        five_hour: { utilization: null, resets_at: sessionReset },
        seven_day: { utilization: null, resets_at: weekReset },
        limits: [
          {
            kind: "session",
            group: "session",
            percent: 100,
            resets_at: sessionReset,
            scope: null,
            is_active: true,
          },
          {
            kind: "weekly_all",
            group: "weekly",
            percent: 22,
            resets_at: weekReset,
            scope: null,
            is_active: false,
          },
        ],
      }),
      now,
    );
    expect(windows).toEqual([
      {
        id: "session",
        usedPercent: 100,
        resetsAt: sessionReset,
        windowMinutes: 300,
      },
      {
        id: "week",
        usedPercent: 22,
        resetsAt: weekReset,
        windowMinutes: 10_080,
      },
    ]);
  });

  it("never draws a block with no utilization as 0% used", () => {
    const windows = anthropicWindows(
      {
        five_hour: { utilization: null, resets_at: sessionReset },
        seven_day: { utilization: "22", resets_at: weekReset },
      },
      now,
    );
    expect(windows).toEqual([]);
  });

  it("falls back to the legacy block when a limit row carries no number", () => {
    const windows = anthropicWindows(
      {
        five_hour: { utilization: 64, resets_at: sessionReset },
        limits: [{ kind: "session", percent: null, resets_at: sessionReset }],
      },
      now,
    );
    expect(windows.map((w) => [w.id, w.usedPercent])).toEqual([
      ["session", 64],
    ]);
  });

  it("maps only an Opus-scoped weekly row to the Opus window", () => {
    const windows = anthropicWindows(
      {
        limits: [
          {
            kind: "weekly_scoped",
            percent: 7,
            resets_at: weekReset,
            scope: { model: { display_name: "Fable" } },
          },
          {
            kind: "weekly_scoped",
            percent: 41,
            resets_at: weekReset,
            scope: { model: { display_name: "Claude Opus 4" } },
          },
          {
            kind: "weekly_scoped",
            percent: 3,
            resets_at: weekReset,
            scope: { model: { display_name: 5 } },
          },
          {
            kind: "weekly_scoped",
            percent: 55,
            resets_at: weekReset,
            scope: { model: { display_name: "Opusculum" } },
          },
          { kind: "something_new", percent: 90, resets_at: weekReset },
        ],
      },
      now,
    );
    expect(windows.map((w) => [w.id, w.usedPercent])).toEqual([
      ["week_opus", 41],
    ]);
  });

  it("keeps a row whose scope has an unexpected shape", () => {
    const windows = anthropicWindows(
      {
        limits: [
          {
            kind: "weekly_all",
            percent: 22,
            resets_at: weekReset,
            scope: "all",
          },
          {
            kind: "session",
            percent: 50,
            resets_at: sessionReset,
            scope: { model: { display_name: 5 } },
          },
        ],
      },
      now,
    );
    expect(windows.map((w) => [w.id, w.usedPercent])).toEqual([
      ["session", 50],
      ["week", 22],
    ]);
  });

  it("settles a limit row whose reset has passed", () => {
    const windows = anthropicWindows(
      {
        limits: [
          {
            kind: "session",
            percent: 100,
            resets_at: "2026-11-21T16:00:00+00:00",
          },
        ],
      },
      now,
    );
    expect(windows).toEqual([
      { id: "session", usedPercent: 0, resetsAt: null, windowMinutes: 300 },
    ]);
  });
});
