import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_RUN_LIST_LABELS } from "../src/labels-details.ts";
import { formatRunDuration, formatRunStart } from "../src/run-history.ts";
import type { RoutineRun, RunStatus } from "../src/types.ts";

const run = (started: string, completed?: string): RoutineRun => ({
  id: "r1",
  routine_id: "rt1",
  status: "surfaced",
  session_key: "routine-rt1",
  started_at: started,
  completed_at: completed,
});

describe("formatRunDuration", () => {
  it("is null while the run is still going", () => {
    assert.equal(formatRunDuration(run("2026-08-07T09:00:00Z")), null);
  });
  it("formats sub-minute spans as seconds", () => {
    assert.equal(
      formatRunDuration(run("2026-08-07T09:00:00Z", "2026-08-07T09:00:12Z")),
      "12s",
    );
  });
  it("formats minute spans with zero-padded seconds", () => {
    assert.equal(
      formatRunDuration(run("2026-08-07T09:00:00Z", "2026-08-07T09:03:05Z")),
      "3m 05s",
    );
  });
  it("formats hour spans with zero-padded minutes", () => {
    assert.equal(
      formatRunDuration(run("2026-08-07T09:00:00Z", "2026-08-07T10:04:30Z")),
      "1h 04m",
    );
  });
  it("is null on a negative span (clock skew) or bad dates", () => {
    assert.equal(
      formatRunDuration(run("2026-08-07T09:00:00Z", "2026-08-07T08:59:00Z")),
      null,
    );
    assert.equal(formatRunDuration(run("not-a-date", "also-not")), null);
  });
});

describe("formatRunStart", () => {
  it("localizes the stamp", () => {
    const stamp = formatRunStart("2026-08-07T14:15:00Z", "en-US");
    assert.match(stamp, /Aug/);
    assert.match(stamp, /15/); // minutes survive whatever the TZ shifts hours to
  });
  it("is empty on a bad date", () => {
    assert.equal(formatRunStart("garbage"), "");
  });
});

describe("run-list status labels", () => {
  it("covers every RunStatus with a flat string", () => {
    const statuses: RunStatus[] = [
      "running",
      "silent",
      "surfaced",
      "error",
      "cancelled",
    ];
    for (const s of statuses) {
      assert.equal(typeof DEFAULT_RUN_LIST_LABELS.status[s], "string");
    }
  });
});
