import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_TRIGGER_LABELS } from "../src/labels.ts";
import {
  isWaitingForFirstEvent,
  triggerBadgeState,
  triggerStatusDetail,
} from "../src/trigger-status-view.ts";
import type { TriggerStatusItem, TriggerStatusState } from "../src/types.ts";

const item = (
  status: TriggerStatusState,
  detail?: string,
): TriggerStatusItem => ({ routine_id: "r1", status, detail });

describe("triggerBadgeState", () => {
  it("resolves absent status to the muted 'unknown' fallback, never nothing", () => {
    // The load-bearing rule: a trigger routine ALWAYS resolves to a state.
    assert.equal(triggerBadgeState(undefined), "unknown");
  });
  it("passes the five wire states through unchanged", () => {
    for (const s of [
      "active",
      "pending",
      "paused_disconnected",
      "paused_revoked",
      "error",
    ] as const) {
      assert.equal(triggerBadgeState(item(s)), s);
    }
  });
});

describe("triggerStatusDetail", () => {
  it("has no detail when there is no status", () => {
    assert.equal(
      triggerStatusDetail(undefined, DEFAULT_TRIGGER_LABELS),
      undefined,
    );
  });
  it("prefers the host's own detail when present", () => {
    assert.equal(
      triggerStatusDetail(
        item("error", "Composio rejected the filter."),
        DEFAULT_TRIGGER_LABELS,
      ),
      "Composio rejected the filter.",
    );
  });
  it("falls back to a standing hint for the paused states", () => {
    assert.equal(
      triggerStatusDetail(item("paused_disconnected"), DEFAULT_TRIGGER_LABELS),
      DEFAULT_TRIGGER_LABELS.statusDisconnectedHint,
    );
    assert.equal(
      triggerStatusDetail(item("paused_revoked"), DEFAULT_TRIGGER_LABELS),
      DEFAULT_TRIGGER_LABELS.statusRevokedHint,
    );
  });
  it("has no detail for active/pending without a host detail", () => {
    assert.equal(
      triggerStatusDetail(item("active"), DEFAULT_TRIGGER_LABELS),
      undefined,
    );
    assert.equal(
      triggerStatusDetail(item("pending"), DEFAULT_TRIGGER_LABELS),
      undefined,
    );
  });
});

describe("isWaitingForFirstEvent", () => {
  it("is true only when active and the routine has never run", () => {
    assert.equal(isWaitingForFirstEvent(item("active"), false), true);
  });
  it("is false once the routine has a run", () => {
    assert.equal(isWaitingForFirstEvent(item("active"), true), false);
  });
  it("is false for any non-active state", () => {
    assert.equal(isWaitingForFirstEvent(item("pending"), false), false);
    assert.equal(isWaitingForFirstEvent(item("error"), false), false);
  });
  it("is false when there is no status yet (unknown)", () => {
    assert.equal(isWaitingForFirstEvent(undefined, false), false);
  });
});

describe("trigger label contract", () => {
  it("carries the muted 'checking' + 'waiting for first event' copy", () => {
    assert.equal(DEFAULT_TRIGGER_LABELS.statusUnknown, "Checking status");
    assert.equal(
      DEFAULT_TRIGGER_LABELS.waitingFirstEvent,
      "Active. Waiting for the first event.",
    );
  });
  it("keeps a human label for every wire state", () => {
    for (const s of [
      "active",
      "pending",
      "paused_disconnected",
      "paused_revoked",
      "error",
    ] as const) {
      assert.ok(DEFAULT_TRIGGER_LABELS.status[s].length > 0);
    }
  });
});
